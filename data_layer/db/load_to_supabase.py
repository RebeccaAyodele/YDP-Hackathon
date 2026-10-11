import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

DB_DIR = Path(__file__).resolve().parent
DATA_LAYER_DIR = DB_DIR.parent
WORKSPACE_ROOT = DATA_LAYER_DIR.parent

if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

# Load .env file from data_layer or repository root
try:
    from dotenv import load_dotenv

    if (DATA_LAYER_DIR / ".env").exists():
        load_dotenv(DATA_LAYER_DIR / ".env")
    elif (WORKSPACE_ROOT / ".env").exists():
        load_dotenv(WORKSPACE_ROOT / ".env")
    else:
        load_dotenv()
except ImportError:
    pass

RAW_DIR = DATA_LAYER_DIR / "data" / "raw"
PROCESSED_DIR = DATA_LAYER_DIR / "data" / "processed"
SCHEMA_SQL = DB_DIR / "supabase_schema.sql"


def clean_records_for_sql(df: pd.DataFrame):
    "Replaces NaN, NaT, and infinity values with None for clean database insertion."
    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if v is None:
                continue
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                row[k] = None
            elif isinstance(v, (np.bool_, bool)):
                row[k] = bool(v)
            elif isinstance(v, (np.integer, int)):
                row[k] = int(v)
            elif isinstance(v, np.floating):
                row[k] = float(v)
    return records


def bulk_insert_records(conn, table_name: str, records: list, conflict_col: str | None = None, chunk_size: int = 25000):
    "Inserts a list of dictionary records into a PostgreSQL table using execute_values."
    if not records:
        return 0

    if hasattr(records[0], "__dict__"):
        records = [r.__dict__ for r in records]

    cur = conn.cursor()
    cols = list(records[0].keys())
    cols_str = ", ".join(cols)

    conflict_clause = f" ON CONFLICT ({conflict_col}) DO NOTHING" if conflict_col else ""
    query = f"INSERT INTO {table_name} ({cols_str}) VALUES %s{conflict_clause}"

    total = len(records)
    t0 = time.time()

    for i in range(0, total, chunk_size):
        chunk = records[i : i + chunk_size]
        vals = [[row.get(c) for c in cols] for row in chunk]
        execute_values(cur, query, vals, page_size=5000)
        conn.commit()

        if total > chunk_size:
            elapsed = time.time() - t0
            progress = min(100.0, (i + len(chunk)) / total * 100)
            print(f"    Uploaded {i + len(chunk):,}/{total:,} ({progress:.1f}%) in {elapsed:.1f}s", end="\r")

    cur.close()
    return total


def load_via_postgres(
    db_url: str,
    facilities_df: pd.DataFrame | None = None,
    feat_df: pd.DataFrame | None = None,
    sim_df: pd.DataFrame | None = None,
    edges_data: list[dict] | None = None,
):
    "Connects to Supabase PostgreSQL and streams all datasets into their tables."
    print("\n[Database] Connecting to Supabase PostgreSQL")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("SELECT version();")
    v = cur.fetchone()[0]
    print(f"Connected to: {v.split(',')[0]}")

    cur.execute(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='facilities');"
    )
    table_exists = cur.fetchone()[0]

    if not table_exists and SCHEMA_SQL.exists():
        print("\n[Setup] Running supabase_schema.sql to create tables and indexes")
        with open(SCHEMA_SQL, "r", encoding="utf-8") as f:
            sql = f.read()
        cur.execute(sql)
        conn.commit()
        print("Schema created successfully.")
    else:
        cur.execute(
            "TRUNCATE TABLE weekly_stock_reports, facility_graph_edges, facility_features, facilities RESTART IDENTITY CASCADE;"
        )
        conn.commit()

    # Ingest Nigeria LGA Indicators
    raw_lga = RAW_DIR / "nigeria_lga_indicators.json"
    if raw_lga.exists():
        print("\nIngesting Nigeria LGA Indicators")
        cur.execute("ALTER TABLE IF EXISTS nigeria_lga_indicators ADD COLUMN IF NOT EXISTS senatorial_district TEXT;")
        conn.commit()
        with open(raw_lga, "r", encoding="utf-8") as f:
            lga_records = json.load(f)
        bulk_insert_records(conn, "nigeria_lga_indicators", lga_records, conflict_col="lga_id")
        print(f"Inserted {len(lga_records)} LGA indicator records.")

    # Essential Commodities Catalog
    raw_comm = RAW_DIR / "essential_commodities.json"
    if raw_comm.exists():
        print("\nIngesting Essential Commodities Catalog")
        with open(raw_comm, "r", encoding="utf-8") as f:
            comm_records = json.load(f)
        bulk_insert_records(conn, "essential_commodities", comm_records, conflict_col="commodity_id")
        print(f"Inserted {len(comm_records)} essential commodities.")

    # Ingest Facilities Registry
    print("\nIngesting Facilities Registry")
    if facilities_df is None:
        fac_parquet = PROCESSED_DIR / "facilities.parquet"
        fac_json = PROCESSED_DIR / "facilities.json"
        if fac_parquet.exists():
            print("Reading facilities from facilities.parquet")
            df_fac = pd.read_parquet(fac_parquet)
            fac_records = clean_records_for_sql(df_fac)
        elif fac_json.exists():
            print("Reading facilities from facilities.json")
            with open(fac_json, "r", encoding="utf-8") as f:
                fac_records = json.load(f)
        else:
            from data_layer.facility_generator import FacilityGenerator

            gen = FacilityGenerator(seed=42)
            fac_records = [f.__dict__ for f in gen.generate_all_facilities()]
    else:
        fac_records = clean_records_for_sql(facilities_df)

    bulk_insert_records(conn, "facilities", fac_records, conflict_col="facility_id")
    print(f"Inserted {len(fac_records):,} primary healthcare facilities.")

    # Ingest Facility Risk Features
    print("\nIngesting Facility Risk Features...")
    if feat_df is None:
        feat_parquet = PROCESSED_DIR / "facility_features.parquet"
        if feat_parquet.exists():
            print("Reading facility features from facility_features.parquet.....")
            feat_df = pd.read_parquet(feat_parquet)
        else:
            if sim_df is None:
                sim_parquet = PROCESSED_DIR / "weekly_stock_reports.parquet"
                if sim_parquet.exists():
                    print("Reading weekly stock reports from weekly_stock_reports.parquet.......")
                    sim_df = pd.read_parquet(sim_parquet)
                else:
                    from data_layer.commodities import ESSENTIAL_COMMODITIES
                    from data_layer.facility_generator import FacilityGenerator
                    from data_layer.simulation_engine import StockSimulationEngine

                    gen = FacilityGenerator(seed=42)
                    fac_objs = gen.generate_all_facilities()
                    sim_eng = StockSimulationEngine(fac_objs, ESSENTIAL_COMMODITIES, num_weeks=52, seed=101)
                    sim_df = sim_eng.export_dataset()

            from data_layer.facility_generator import FacilityGenerator
            from data_layer.feature_extractor import FacilityFeatureExtractor

            gen = FacilityGenerator(seed=42)
            fac_objs = gen.generate_all_facilities()
            extractor = FacilityFeatureExtractor(fac_objs, sim_df, eval_week=52)
            feat_df = extractor.extract_features()

    feat_records = clean_records_for_sql(feat_df)
    bulk_insert_records(conn, "facility_features", feat_records, conflict_col="facility_id")
    print(f"Inserted {len(feat_records):,} facility risk feature records.")

    # Ingest Facility Graph Edges
    print("\nIngesting Facility Graph Edges...")
    if edges_data is None:
        edges_json = PROCESSED_DIR / "facility_graph_edges.json"
        if edges_json.exists():
            print("Reading edges from facility_graph_edges.json...........")
            with open(edges_json, "r", encoding="utf-8") as f:
                edges_records = json.load(f)
        else:
            from data_layer.facility_generator import FacilityGenerator
            from data_layer.network_builder import FacilityNetworkBuilder

            gen = FacilityGenerator(seed=42)
            fac_objs = gen.generate_all_facilities()
            builder = FacilityNetworkBuilder(fac_objs, k_neighbors=3)
            edges_records = [e.__dict__ for e in builder.build_network()]
    else:
        edges_records = edges_data

    bulk_insert_records(conn, "facility_graph_edges", edges_records)
    print(f"Inserted {len(edges_records):,} spatial network edges.")

    # Ingest Weekly Stock Reports (Full Data)
    print("\nIngesting Weekly Stock Reports (Full Data)...")
    if sim_df is None:
        sim_parquet = PROCESSED_DIR / "weekly_stock_reports.parquet"
        if sim_parquet.exists():
            print("Reading weekly stock reports from weekly_stock_reports.parquet.........")
            sim_df = pd.read_parquet(sim_parquet)
        else:
            from data_layer.commodities import ESSENTIAL_COMMODITIES
            from data_layer.facility_generator import FacilityGenerator
            from data_layer.simulation_engine import StockSimulationEngine

            gen = FacilityGenerator(seed=42)
            fac_objs = gen.generate_all_facilities()
            sim_eng = StockSimulationEngine(fac_objs, ESSENTIAL_COMMODITIES, num_weeks=52, seed=101)
            sim_df = sim_eng.export_dataset()

    print(f"Preparing and streaming {len(sim_df):,} weekly events..........")
    sim_records = clean_records_for_sql(sim_df)
    total_inserted = bulk_insert_records(conn, "weekly_stock_reports", sim_records, chunk_size=25000)
    print(f"\nSuccessfully inserted all {total_inserted:,} weekly stock report records into Supabase.")

    cur.close()
    conn.close()
    print("\nALL DATASETS SUCCESSFULLY INGESTED INTO SUPABASE POSTGRESQL!")


def main():
    print("Repulse: SUPABASE DATA INGESTION")
    db_url = os.getenv("DATABASE_URL")
    if db_url and "YOUR_PASSWORD" not in db_url:
        load_via_postgres(db_url)
    else:
        print("\n[Configuration Required]")
        print("Please configure DATABASE_URL in your .env file.")
        sys.exit(1)


if __name__ == "__main__":
    main()
