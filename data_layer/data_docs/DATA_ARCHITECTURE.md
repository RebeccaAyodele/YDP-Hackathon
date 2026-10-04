# PHC Pulse: Data Layer Architecture & Pipeline Guide

This document details the **data layer**, explaining what each file in the data pipeline does, how data moves through the system, and how the datasets are generated, persisted locally as Parquet, and streamed to Supabase.

---

## 1. End-to-End Data Flow

```
[Raw Sources]
 • GRID3 Facility GPS CSV (1,292 facilities across 24 focal LGAs)
 • NBS 2022 Multidimensional Poverty Index (MPI) Survey Data
 • NDHS 2023-24 Maternal & Child Health Indicators
 • WHO Malaria & Africa CDC Disease Burden Profiles
           │
           ▼
[Pipeline Entrypoint: python run_pipeline.py]
 ├── data_layer/real_indicators.py   : Exports data_layer/data/raw/nigeria_lga_indicators.json
 ├── data_layer/commodities.py       : Exports data_layer/data/raw/essential_commodities.json
 ├── data_layer/facility_generator.py: Ingests GRID3 CSV, calibrates staffing, SDD cold chains, power
 │                                     Exports data_layer/data/processed/facilities.parquet & .json
 ├── data_layer/simulation_engine.py : 52-week stock flow & compounding reporting decay simulation
 │                                     Regional seasons: Rainy (South bimodal vs North unimodal)
 │                                     Harmattan / Dry season (South mild vs North severe)
 │                                     Exports data_layer/data/processed/weekly_stock_reports.parquet (537k rows)
 ├── data_layer/network_builder.py   : Haversine k-NN spatial proximity graph (k=3 neighbors)
 │                                     Exports data_layer/data/processed/facility_graph_edges.json (3,876 edges)
 ├── data_layer/feature_extractor.py : 40-dimensional risk triage feature matrix evaluated at Week 52
 │                                     Exports data_layer/data/processed/facility_features.parquet
 └── data_layer/db/load_to_db.py     : Ingests all processed datasets directly into Supabase PostgreSQL
           │
           ▼
[Storage: data_layer/data/processed/ (*.parquet & *.json)]
 Highly compressed, strictly typed local columnar storage
           │
           ▼
[Standalone Database Ingestion: python -m data_layer.db.load_to_supabase]
 Streams pre-computed Parquet files in memory-efficient batches of 25,000 into Supabase
```

---

## 2. Pipeline Execution & Script Roles

### `run_pipeline.py` (Root Entrypoint)
- **Role**: Root execution script for running the complete end-to-end data pipeline.
- **Location**: Workspace root `run_pipeline.py`.
- **Execution**:
  ```bash
  python run_pipeline.py
  ```
- **Execution Flow**:
  1. **Raw Indicator Generation**: Writes `nigeria_lga_indicators.json` (calibrated with official NBS 2022 MPI and NDHS indicators) and `essential_commodities.json`.
  2. **Facility Registry Parsing**: Ingests real facility GPS coordinates and metadata from `GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv`, normalizes NPHCDA tiers, and calibrates staffing and cold-chain capacity.
  3. **Mechanistic Simulation**: Runs the 52-week stock depletion, seasonal surge, and reporting decay simulation across all 1,292 facilities and 8 essential commodities.
  4. **Spatial Network Construction**: Computes spherical Haversine distances to build the directed $k=3$ nearest neighbor graph.
  5. **Feature Engineering**: Constructs the 40-dimensional facility feature matrix for triage classification.
  6. **Database Ingestion**: Streams all records directly into Supabase PostgreSQL tables using `init_and_load_db()`.
  7. **Validation Verification**: Executes analytical checks comparing physical stockout rates between silent facilities ($\ge 3$ missed reports) and actively reporting facilities.

---

### `data_layer/db/load_to_supabase.py` (Offline / Standalone Database Streamer)
- **Role**: Bulk loads pre-computed local Parquet and JSON files into Supabase without re-running the simulation.
- **Location**: `data_layer/db/load_to_supabase.py`.
- **Inputs**:
  - `data_layer/data/processed/facilities.parquet` (or `.json`)
  - `data_layer/data/processed/facility_features.parquet`
  - `data_layer/data/processed/facility_graph_edges.json`
  - `data_layer/data/processed/weekly_stock_reports.parquet`
  - `data_layer/data/raw/nigeria_lga_indicators.json`
  - `data_layer/data/raw/essential_commodities.json`
  - Database connection string from `.env` (`DATABASE_URL`).
- **Execution**:
  ```bash
  python -m data_layer.db.load_to_supabase
  ```
- **Batching**: Streams 537k+ rows into PostgreSQL using `psycopg2.extras.execute_values` in chunks of 25,000 for low-memory overhead.

---

### `data_layer/db/load_to_db.py` (Database Ingestion Wrapper)
- **Role**: Programmatic wrapper exposing `init_and_load_db(facilities_df, feat_df, sim_df, edges_data)` used by `run_pipeline.py`.
- **Location**: `data_layer/db/load_to_db.py`.

---

### `data_layer/db/supabase_schema.sql` (Relational Schema & DDL)
- **Role**: PostgreSQL DDL file defining table structures, primary keys, foreign keys, cascades, and B-Tree indexes.
- **Location**: `data_layer/db/supabase_schema.sql`.
- **Tables Defined**:
  1. `nigeria_lga_indicators`: LGA-level baseline poverty, immunization, mortality, and infrastructure access.
  2. `essential_commodities`: Catalog of the 8 monitored primary care medicines and vaccines.
  3. `facilities`: 1,292 geocoded facilities with staffing, power, water, and cold-chain capacity.
  4. `facility_features`: 40-feature triage table evaluated at Week 52 for risk scoring.
  5. `facility_graph_edges`: Directed spatial adjacency graph ($k=3$ neighbors per facility).
  6. `weekly_stock_reports`: 52-week time-series of inventory, consumption, resupply, stockout events, and reporting status.

---

## 3. Data Science Modules (`data_layer/`)

### 1. `data_layer/real_indicators.py` (Empirical Macro Indicators)
- **Role**: Grounded repository of official Nigerian health and poverty data.
- **Key Enhancements & Authentic NBS 2022 MPI Calibration**:
  - Contains official `GEOPOLITICAL_ZONE_MPI_2022` and `STATE_MPI_2022` reference dictionaries from the National Bureau of Statistics (NBS) 2022 Survey:
    - **National Average MPI**: `0.257` (Incidence $H = 62.9\%$, Intensity $A = 40.9\%$)
    - **Lagos State**: `0.026` (*Least poor*)
    - **Bayelsa State**: `0.186` (*Moderately poor*)
    - **Plateau State**: `0.259` (*Moderately poor*)
    - **Ebonyi State**: `0.380` (*Very poor*)
    - **Sokoto State**: `0.536` (*Extremely poor*)
    - **Yobe State**: `0.562` (*Extremely poor*)
  - **No LGA has an MPI of 0.90**: Headcount indicators previously confused with MPI scores have been corrected. LGA values strictly range from `0.015` (Ikeja, Lagos) to `0.660` (Gujba, Yobe), calibrated around state baselines.
- **Indicators Encapsulated**:
  - `poverty_headcount_mpi`: Multidimensional Poverty Index score ($H \times A$).
  - `full_immunization_rate`: NDHS Full Immunization Coverage (FIC %).
  - `anc4_coverage_rate`: NDHS Antenatal Care 4+ visits %.
  - `under5_mortality_per_1k`: NDHS U5 mortality per 1,000 live births.
  - `malaria_endemicity_score`, `cholera_risk_score`, `road_access_index`, `telecom_coverage_rate`.

---

### 2. `data_layer/commodities.py` (Essential Commodities Catalog)
- **Role**: Specifications for the 8 monitored primary care medicines and vaccines.
- **Seasonal Peaks**:
  - Standardized to Nigeria's two seasons: `"rainy"`, `"harmattan"` (or `"dry"`), and `"none"`.
  - **Malaria ACTs & RDTs**: `seasonal_peak="rainy"` (surge multiplier 1.80x–1.85x).
  - **ORS + Zinc Co-pack**: `seasonal_peak="rainy"` (surge multiplier 1.60x during flood/runoff).
  - **Amoxicillin 250mg DT (Pediatric IMCI Pneumonia)**: `seasonal_peak="harmattan"` (surge multiplier 1.40x during dry dust season).
  - **Measles Vaccine**: `seasonal_peak="harmattan"` (surge multiplier 1.50x during dry hot season outbreaks).
  - **Oxytocin, Pentavalent, Mama Kits**: `seasonal_peak="none"` (constant baseline birth/immunization velocity).

---

### 3. `data_layer/facility_generator.py` (Facility Synthesis & GRID3 Ingestion)
- **Role**: Reads the 1,292 real facilities from the official GRID3 CSV and enriches them with calibrated operational attributes.
- **Attributes Calibrated**:
  - **NPHCDA Tiers**: Normalizes facilities into Comprehensive Health Centre (CHC), Primary Health Centre (PHC), Primary Health Clinic, and Health Post.
  - **Staffing**: Assigns realistic counts of doctors, nurse-midwives, and Community Health Extension Workers (CHEWs) under Nigeria's Task-Shifting Policy.
  - **Cold Chain & Solar**: Calibrates Solar Direct Drive (SDD) refrigeration, solar power, and borehole water access.
  - **Extreme Poverty Adaptation**: High-poverty penalty adjusted to `lga.poverty_headcount_mpi > 0.50` (targeting Sokoto and Yobe) to properly mirror the authentic NBS 2022 MPI scale.

---

### 4. `data_layer/simulation_engine.py` (Mechanistic Simulation Engine)
- **Role**: 52-week micro-simulation modeling physical stock flows and behavioral reporting dynamics.
- **Regional Seasonality Modeling (South vs. North)**:
  - **Rainy Season**:
    - **South (SW, SS, SE)**: March/April to October/November (Weeks 12 to 46). Bimodal curve with two peaks: June–July (primary peak, Week 26), August break floor, and September (secondary peak, Week 37).
    - **North (NW, NE, NC)**: May/June to September (Weeks 20 to 39). Unimodal curve with a single concentrated peak in July–August (Week 31).
  - **Harmattan / Dry Season**:
    - **South**: December to February (Weeks 49–52 and Weeks 1–8). Milder, shorter, felt mainly Dec–Jan.
    - **North**: November to March (Weeks 45–52 and Weeks 1–13). Earlier, longer, more severe dry dusty Sahara trade winds.
  - **Resupply Monsoon Washout**: Rural unpaved routes ($>0.65$ transport difficulty) face a 45% delivery postponement during their respective regional peak rain windows (June–July and Sept in the South; July–August in the North).
- **Compounding Silence**: Reporting probability follows $P(\text{Report}_t) = P_0 \times (0.72)^k$. A facility missing 3 consecutive weeks suffers an acute information blackout right as physical stock depletes.

---

### 5. `data_layer/network_builder.py` (Spatial Adjacency Network)
- **Role**: Builds the geographical proximity graph connecting neighboring health centres.
- **Methodology**:
  - Calculates true great-circle geodesic distances using spherical Haversine trigonometry.
  - Connects each facility to its $k=3$ nearest neighbors (3,876 directed edges).
  - Assigns inverse-distance overflow weights $w_{ij}$ and capacity buffer ratios to model patient redirection dynamics when stockouts occur.

---

### 6. `data_layer/feature_extractor.py` (Risk Triage Feature Engineering)
- **Role**: Evaluates the longitudinal simulation at Week 52 to construct a 40-dimensional feature matrix for machine learning risk triage.
- **Feature Categories**:
  - Reporting Dynamics (silence duration, completeness over 4 and 12 weeks, reporting trends).
  - Inventory Depletion Signals (stock-to-consumption ratios, estimated buffer weeks remaining).
  - Facility Infrastructure & Staffing (rurality, cold-chain status, power, transport difficulty, GSM signal).
  - Contextual Priors (NBS MPI score, NDHS immunization, U5 mortality, malaria endemicity).
  - Ground-Truth Targets (stockout occurrence, count of stocked-out commodities, composite vulnerability score).

---

## 4. Local Datasets Directory (`data_layer/data/`)

```
data_layer/data/
├── raw/
│   ├── nigeria_lga_indicators.json      # 24 calibrated LGAs with authentic NBS 2022 MPI
│   └── essential_commodities.json       # 8 monitored medicines and vaccines
└── processed/
    ├── facilities.parquet               # 1,292 geocoded facilities with staffing & cold chains
    ├── facilities.json                  # JSON export of facilities registry
    ├── weekly_stock_reports.parquet     # 537,472 weekly commodity stock events (52 weeks)
    ├── facility_features.parquet        # 1,292 facility risk triage feature records (40 features)
    └── facility_graph_edges.json        # 3,876 directed spatial network edges (k=3)
```
