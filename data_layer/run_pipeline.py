import sys
import json
from pathlib import Path
import pandas as pd

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
DATA_LAYER_DIR = Path(__file__).resolve().parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from data_layer.real_indicators import save_raw_indicators, NIGERIA_LGA_DATA
from data_layer.commodities import ESSENTIAL_COMMODITIES
from data_layer.facility_generator import FacilityGenerator
from data_layer.simulation_engine import StockSimulationEngine
from data_layer.network_builder import FacilityNetworkBuilder
from data_layer.feature_extractor import FacilityFeatureExtractor
from data_layer.db.load_to_db import init_and_load_db


def run_pipeline():
    print("PHC PULSE: NIGERIAN PRIMARY HEALTHCARE DATA LAYER PIPELINE")

    # Output paths
    raw_dir = DATA_LAYER_DIR / "data" / "raw"
    processed_dir = DATA_LAYER_DIR / "data" / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    # Raw Indicators & Commodities Catalog
    print("\nExporting Real Public Health Baseline Indicators.......")
    raw_lga_path = raw_dir / "nigeria_lga_indicators.json"
    save_raw_indicators(raw_lga_path)
    print(f"Saved {len(NIGERIA_LGA_DATA)} LGAs with NDHS/NBS/WHO priors to {raw_lga_path.name}")
    commodities_path = raw_dir / "essential_commodities.json"
    with open(commodities_path, "w", encoding="utf-8") as f:
        json.dump([c.__dict__ for c in ESSENTIAL_COMMODITIES], f, indent=2)
    print(f"Saved {len(ESSENTIAL_COMMODITIES)} essential commodities to {commodities_path.name}")

    # Facility Registry Generation
    print("\nGenerating Calibrated Facility Registry.....")
    generator = FacilityGenerator(seed=42)
    facilities = generator.export_to_json(processed_dir / "facilities.json")
    facilities_df = pd.DataFrame([f.__dict__ for f in facilities])
    facilities_df.to_parquet(processed_dir / "facilities.parquet", index=False)
    print(f"Saved facilities to {processed_dir.name}/facilities.parquet")

    print(f"Generated {len(facilities)} Primary Healthcare Facilities across {len(NIGERIA_LGA_DATA)} LGAs.")
    print(f"Comprehensive Health Centres: {(facilities_df['facility_type'] == 'Comprehensive Health Centre').sum()}")
    print(f"Primary Health Centres: {(facilities_df['facility_type'] == 'Primary Health Centre').sum()}")
    print(f"Primary Health Clinics: {(facilities_df['facility_type'] == 'Primary Health Clinic').sum()}")
    print(f"Health Posts: {(facilities_df['facility_type'] == 'Health Post').sum()}")
    print(f"Rural facilities: {facilities_df['is_rural'].sum()} ({facilities_df['is_rural'].mean():.1%})")
    print(f"Cold-chain equipped: {facilities_df['has_cold_chain'].sum()} ({facilities_df['has_cold_chain'].mean():.1%})")

    # Mechanistic Simulation (52 Weeks)
    print("\nRunning Mechanistic Simulation (52 Weeks)........")
    sim_engine = StockSimulationEngine(facilities=facilities, commodities=ESSENTIAL_COMMODITIES, num_weeks=52, seed=101)
    sim_df = sim_engine.export_dataset()
    sim_df.to_parquet(processed_dir / "weekly_stock_reports.parquet", index=False)
    print(f"Saved {len(sim_df):,} records to {processed_dir.name}/weekly_stock_reports.parquet")

    # Simulation Sanity Diagnostics
    reporting_rate = sim_df["report_submitted"].mean()
    stockout_rate = sim_df["is_stockout"].mean()
    print(f"    - Overall report submission rate: {reporting_rate:.1%}")
    print(f"    - Overall weekly stockout event rate: {stockout_rate:.1%}")

    # Spatial Adjacency Network Builder (Cascading Risk Layer Graph)
    print("\nBuilding Facility Spatial Network (Haversine k-NN).........")
    network_builder = FacilityNetworkBuilder(facilities, k_neighbors=3)
    edges = network_builder.export_graph_json(processed_dir / "facility_graph_edges.json")
    print(f"Constructed spatial graph with {len(edges)} directed edges (k=3 neighbors per facility).")

    # Feature Extraction Pipeline
    print("\nExtracting Feature Matrix for Risk Triage...")
    feature_extractor = FacilityFeatureExtractor(facilities, sim_df, eval_week=52)
    feat_df = feature_extractor.extract_features()
    feat_df.to_parquet(processed_dir / "facility_features.parquet", index=False)
    print(f"Saved {len(feat_df)} facility feature rows to {processed_dir.name}/facility_features.parquet")

    # Database Ingestion: Supabase db
    print("\nIngesting All Datasets Directly into Supabase Database............")
    init_and_load_db(facilities_df=facilities_df, feat_df=feat_df, sim_df=sim_df, edges_data=edges)

    #quick check on data
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
