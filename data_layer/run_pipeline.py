import argparse
import json
import sys
from pathlib import Path

import pandas as pd

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
DATA_LAYER_DIR = Path(__file__).resolve().parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))
if str(DATA_LAYER_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_LAYER_DIR))

try:
    from data_layer.commodities import ESSENTIAL_COMMODITIES
    from data_layer.db.load_to_db import init_and_load_db
    from data_layer.facility_generator import FacilityGenerator, FacilityRecord
    from data_layer.feature_extractor import FacilityFeatureExtractor
    from data_layer.network_builder import FacilityNetworkBuilder
    from data_layer.real_indicators import NIGERIA_LGA_DATA, save_raw_indicators
    from data_layer.risk_engine import run_risk_engine
    from data_layer.simulation_engine import StockSimulationEngine
except ImportError:
    from commodities import ESSENTIAL_COMMODITIES
    from db.load_to_db import init_and_load_db
    from facility_generator import FacilityGenerator, FacilityRecord
    from feature_extractor import FacilityFeatureExtractor
    from network_builder import FacilityNetworkBuilder
    from real_indicators import NIGERIA_LGA_DATA, save_raw_indicators
    from risk_engine import run_risk_engine
    from simulation_engine import StockSimulationEngine


def run_pipeline(force_recompute: bool = False, skip_db: bool = False):
    print("PHC PULSE: NIGERIAN PRIMARY HEALTHCARE DATA LAYER PIPELINE")

    # Output paths
    raw_dir = DATA_LAYER_DIR / "data" / "raw"
    processed_dir = DATA_LAYER_DIR / "data" / "processed"
    models_dir = DATA_LAYER_DIR / "data" / "models"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)

    raw_lga_path = raw_dir / "nigeria_lga_indicators.json"
    commodities_path = raw_dir / "essential_commodities.json"
    fac_json_path = processed_dir / "facilities.json"
    fac_parquet_path = processed_dir / "facilities.parquet"
    sim_parquet_path = processed_dir / "weekly_stock_reports.parquet"
    edges_json_path = processed_dir / "facility_graph_edges.json"
    feat_parquet_path = processed_dir / "facility_features.parquet"
    risk_parquet_path = processed_dir / "facility_risk_scores.parquet"
    risk_json_path = processed_dir / "facility_risk_scores.json"
    model_path = models_dir / "risk_scoring_model.joblib"

    # Raw Indicators & Commodities Catalog
    print("\nReal Public Health Baseline Indicators & Commodities")
    if not force_recompute and raw_lga_path.exists() and commodities_path.exists():
        print(f"Files already exist at {raw_lga_path.name} and {commodities_path.name}. Skipping generation.........")
    else:
        print("Exporting Real Public Health Baseline Indicators...")
        save_raw_indicators(raw_lga_path)
        print(f"Saved {len(NIGERIA_LGA_DATA)} LGAs with NDHS/NBS/WHO priors to {raw_lga_path.name}")
        with open(commodities_path, "w", encoding="utf-8") as f:
            json.dump([c.__dict__ for c in ESSENTIAL_COMMODITIES], f, indent=2)
        print(f"Saved {len(ESSENTIAL_COMMODITIES)} essential commodities to {commodities_path.name}")

    # Facility Registry Generation
    print("\nCalibrated Facility Registry")
    if not force_recompute and fac_parquet_path.exists() and fac_json_path.exists():
        print(f"Files already exist ({fac_parquet_path.name}, {fac_json_path.name}). Loading from disk.......")
        facilities_df = pd.read_parquet(fac_parquet_path)
        with open(fac_json_path, "r", encoding="utf-8") as f:
            fac_data = json.load(f)
        facilities = [FacilityRecord(**f) for f in fac_data]
        print(f"Loaded {len(facilities)} Primary Healthcare Facilities from {fac_parquet_path.name}.")
    else:
        print("Generating Calibrated Facility Registry..........")
        generator = FacilityGenerator(seed=42)
        facilities = generator.export_to_json(fac_json_path)
        facilities_df = pd.DataFrame([f.__dict__ for f in facilities])
        facilities_df.to_parquet(fac_parquet_path, index=False)
        print(f"Saved facilities to {processed_dir.name}/{fac_parquet_path.name}")
        print(f"Generated {len(facilities)} Primary Healthcare Facilities across {len(NIGERIA_LGA_DATA)} LGAs.")

    print(f"Comprehensive Health Centres: {(facilities_df['facility_type'] == 'Comprehensive Health Centre').sum()}")
    print(f"Primary Health Centres: {(facilities_df['facility_type'] == 'Primary Health Centre').sum()}")
    print(f"Primary Health Clinics: {(facilities_df['facility_type'] == 'Primary Health Clinic').sum()}")
    print(f"Health Posts: {(facilities_df['facility_type'] == 'Health Post').sum()}")
    print(f"Rural facilities: {facilities_df['is_rural'].sum()} ({facilities_df['is_rural'].mean():.1%})")
    print(
        f"Cold-chain equipped: {facilities_df['has_cold_chain'].sum()} ({facilities_df['has_cold_chain'].mean():.1%})"
    )

    # Mechanistic Simulation (52 Weeks)
    print("\nMechanistic Simulation (52 Weeks)")
    if not force_recompute and sim_parquet_path.exists():
        print(f"Dataset already exists at {sim_parquet_path.name}. Loading from disk.....")
        sim_df = pd.read_parquet(sim_parquet_path)
        print(f"Loaded {len(sim_df):,} records from {processed_dir.name}/{sim_parquet_path.name}")
    else:
        print("Running Mechanistic Simulation (52 Weeks)...........")
        sim_engine = StockSimulationEngine(
            facilities=facilities, commodities=ESSENTIAL_COMMODITIES, num_weeks=52, seed=101
        )
        sim_df = sim_engine.export_dataset()
        sim_df.to_parquet(sim_parquet_path, index=False)
        print(f"Saved {len(sim_df):,} records to {processed_dir.name}/{sim_parquet_path.name}")

    # Simulation Sanity Diagnostics
    reporting_rate = sim_df["report_submitted"].mean()
    stockout_rate = sim_df["is_stockout"].mean()
    print(f"Overall report submission rate: {reporting_rate:.1%}")
    print(f"Overall weekly stockout event rate: {stockout_rate:.1%}")

    # Spatial Adjacency Network Builder (Cascading Risk Layer Graph)
    print("\nFacility Spatial Network (Haversine k-NN)")
    if not force_recompute and edges_json_path.exists():
        print(f"Graph already exists at {edges_json_path.name}. Loading from disk.......")
        with open(edges_json_path, "r", encoding="utf-8") as f:
            edges = json.load(f)
        print(f"Loaded spatial graph with {len(edges)} directed edges from {edges_json_path.name}.")
    else:
        print("Building Facility Spatial Network (Haversine k-NN).........")
        network_builder = FacilityNetworkBuilder(facilities, k_neighbors=3)
        edges = network_builder.export_graph_json(edges_json_path)
        print(f"Constructed spatial graph with {len(edges)} directed edges (k=3 neighbors per facility).")

    # Feature Extraction Pipeline
    print("\nFeature Matrix for Risk Triage")
    if not force_recompute and feat_parquet_path.exists():
        print(f"Dataset already exists at {feat_parquet_path.name}. Loading from disk...")
        feat_df = pd.read_parquet(feat_parquet_path)
        print(f"Loaded {len(feat_df)} facility feature rows from {processed_dir.name}/{feat_parquet_path.name}")
    else:
        print("Extracting Feature Matrix for Risk Triage...")
        feature_extractor = FacilityFeatureExtractor(facilities, sim_df, eval_week=52)
        feat_df = feature_extractor.extract_features()
        feat_df.to_parquet(feat_parquet_path, index=False)
        print(f"Saved {len(feat_df)} facility feature rows to {processed_dir.name}/{feat_parquet_path.name}")

    # Risk Engine: Gradient-Boosted ML Triage & Spatial Cascading Propagation
    print("\nRisk Engine (ML Risk Scoring & Spatial Cascading Propagation)")
    if not force_recompute and risk_parquet_path.exists() and risk_json_path.exists() and model_path.exists():
        print("Model and risk scores already exist. Skipping ML re-training.")
        print(f"  Existing files: {risk_parquet_path.name}, {risk_json_path.name}, {model_path.name}")
    else:
        print("Executing Risk Engine (ML Risk Scoring & Spatial Cascading Propagation).......")
        run_risk_engine(
            features_path=feat_parquet_path,
            edges_path=edges_json_path,
            output_dir=processed_dir,
        )

    # Database Ingestion: Supabase db
    if skip_db:
        print("\n[Database Ingestion] Skipping Supabase ingestion (--skip-db specified).")
    else:
        print("\nIngesting All Datasets Directly into Supabase Database............")
        init_and_load_db(facilities_df=facilities_df, feat_df=feat_df, sim_df=sim_df, edges_data=edges)

    # Quick check on data
    print("\nANALYTICAL VALIDATION: CORE INSIGHT VERIFICATION")

    silent_facilities = feat_df[feat_df["weeks_since_last_report"] >= 3]
    active_facilities = feat_df[feat_df["weeks_since_last_report"] < 3]

    silent_stockout_rate = silent_facilities["ground_truth_stockout_any"].mean()
    active_stockout_rate = active_facilities["ground_truth_stockout_any"].mean()

    print(f"Silent Facilities (>= 3 weeks no report, n={len(silent_facilities)}):")
    print(f"Actual Ground-Truth Stockout Rate: {silent_stockout_rate:.1%}")
    print(f"Mean Ground-Truth Risk Score: {silent_facilities['ground_truth_risk_score'].mean():.1f}/100")

    print(f"\nActive Facilities (< 3 weeks no report, n={len(active_facilities)}):")
    print(f"Actual Ground-Truth Stockout Rate: {active_stockout_rate:.1%}")
    print(f"Mean Ground-Truth Risk Score: {active_facilities['ground_truth_risk_score'].mean():.1f}/100")

    # Rural vs Urban disparity check
    rural_facilities = feat_df[feat_df["is_rural"] == 1]
    urban_facilities = feat_df[feat_df["is_rural"] == 0]
    print("\nRural Disparity Check:")
    print(
        f"Rural Average Staffing: {rural_facilities['total_staff'].mean():.1f} vs Urban: {urban_facilities['total_staff'].mean():.1f}"
    )
    print(
        f"Rural Cold Chain Rate: {rural_facilities['has_cold_chain'].mean():.1%} vs Urban: {urban_facilities['has_cold_chain'].mean():.1%}"
    )
    print(
        f"Rural Reporting Completeness (12w): {rural_facilities['reporting_completeness_12w'].mean():.1%} vs Urban: {urban_facilities['reporting_completeness_12w'].mean():.1%}"
    )

    print("\nDATA LAYER BUILD AND SUPABASE INGESTION SUCCESSFUL")
    return facilities_df, feat_df, sim_df, edges


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PHC Pulse - Data Layer Pipeline Runner")
    parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Force regeneration of all datasets even if output files already exist.",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Skip database ingestion into Supabase.",
    )
    args = parser.parse_args()
    run_pipeline(force_recompute=args.force, skip_db=args.skip_db)
