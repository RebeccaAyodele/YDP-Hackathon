# PHC Pulse: Data Layer & Assumptions Documentation
---

## 1. Executive Summary

The PHC Pulse data layer combines **grounded public health empirical data** (Nigeria Demographic and Health Survey [NDHS], National Bureau of Statistics [NBS] Multidimensional Poverty Index, WHO disease surveillance) with a **calibrated mechanistic simulation engine**.

Rather than treating data as static or assigning stockout labels randomly, the data layer simulates the underlying physical and behavioral processes of Nigeria's primary healthcare delivery:
1. **Dynamic Stock Flow**: Weekly inventory decreases via patient consumption and increases through logistics resupply. Stockouts emerge naturally when inventory hits zero.
2. **Coupled Reporting Breakdown ("Silence Compounds")**: Understaffed and rural facilities face higher operational friction. Missing one report significantly increases the probability of missing consecutive reports, creating a blind spot in conventional monitoring systems.
3. **Correlated Resource Disparities**: Rural facilities systematically possess fewer staff, limited cold-chain solar equipment, worse road connectivity, and more erratic resupply intervals.
4. **Spatial Proximity Graph**: Captures the geographical topology of facilities using precise Haversine distance, establishing the foundation for cascading overflow risk.
5. **Authentic Epidemiological & Regional Seasonality**: Incorporates Nigeria's two distinct seasons (Rainy and Harmattan/Dry) differentiated across Northern and Southern ecological zones.

---

## 2. Distinction Between Real and Simulated Data

### Focal Cohort: 6 States Across All 6 Geopolitical Zones
Following the **NBS 2022 Multidimensional Poverty Index (MPI)** ranking and **GRID3 Nigeria Master Facility Registry**, the data layer models 6 focused states (1 per geopolitical zone) contrasting the commercial urban benchmark against the documented most struggling states in primary healthcare delivery:

1. **South West**: **Lagos** (Urban benchmark: State MPI **0.026**, Incidence $H = 5.9\%$, Intensity $A = 44.3\%$, *Least poor*).
2. **South South**: **Bayelsa** (State MPI **0.186**, Incidence $H = 40.6\%$, Intensity $A = 45.8\%$, *Moderately poor*, extreme riverine Niger Delta geography).
3. **North Central**: **Plateau** (State MPI **0.259**, Incidence $H = 55.6\%$, Intensity $A = 46.6\%$, *Moderately poor*, central highland terrain).
4. **South East**: **Ebonyi** (State MPI **0.380**, Incidence $H = 73.0\%$, Intensity $A = 52.1\%$, *Very poor*, agrarian rurality, endemic cholera and Lassa fever risks).
5. **North West**: **Sokoto** (State MPI **0.536**, Incidence $H = 87.9\%$, Intensity $A = 61.0\%$, *Extremely poor*, lowest immunization coverage, border Sahelian rurality).
6. **North East**: **Yobe** (State MPI **0.562**, Incidence $H = 89.5\%$, Intensity $A = 62.8\%$, *Extremely poor*, conflict infrastructure recovery, severe malnutrition challenges).

---

### Official NBS 2022 Multidimensional Poverty Index (MPI) Benchmarks

In the Alkire-Foster methodology ($MPI = H \times A$), **there is no MPI of 0.90**. A value of 0.90 represents extreme headcount incidence ($H$), whereas the composite MPI index in Nigeria strictly ranges between **0.026** (Lagos) and **0.562** (Yobe), with a national average of **0.257**.

#### By Geopolitical Zone (NBS 2022)
| Geopolitical Zone | MPI ($H \times A$) | Incidence ($H\%$) | Intensity ($A\%$) | Poor People (Million) |
|---|:---:|:---:|:---:|:---:|
| **National** | **0.257** | **62.9%** | **40.9%** | **132.92** |
| **North Central** | 0.272 | 66.3% | 41.0% | 20.19 |
| **North East** | 0.324 | 76.5% | 42.4% | 20.47 |
| **North West** | 0.324 | 75.8% | 42.7% | 45.49 |
| **South East** | 0.183 | 49.0% | 37.3% | 10.85 |
| **South South** | 0.250 | 62.6% | 39.8% | 19.66 |
| **South West** | 0.151 | 40.0% | 37.7% | 16.27 |

#### Focal States (NBS 2022)
| State | Zone | MPI Value | Incidence ($H\%$) | Intensity ($A\%$) | Official Classification |
|---|---|:---:|:---:|:---:|---|
| **Lagos** | South West | **0.026** | 5.9% | 44.3% | Least poor |
| **Bayelsa** | South South | **0.186** | 40.6% | 45.8% | Moderately poor |
| **Plateau** | North Central | **0.259** | 55.6% | 46.6% | Moderately poor |
| **Ebonyi** | South East | **0.380** | 73.0% | 52.1% | Very poor |
| **Sokoto** | North West | **0.536** | 87.9% | 61.0% | Extremely poor |
| **Yobe** | North East | **0.562** | 89.5% | 62.8% | Extremely poor |

---

### Empirical vs. Simulated Data Mapping

| Component | Nature | Source / Justification | Official External Reference |
| :--- | :--- | :--- | :--- |
| **LGA Boundaries & Centroids** | **Real** | 24 LGAs across 6 representative states. | [GRID3 Nigeria GeoPortal](https://nigeria.grid3.org/) |
| **Multidimensional Poverty Index (MPI)** | **Real** | NBS Nigeria Multidimensional Poverty Index Survey (2022). | [National Bureau of Statistics (NBS)](https://nigerianstat.gov.ng) |
| **Maternal & Child Health Indicators** | **Real** | NDHS: Antenatal Care (ANC 4+), Full Immunization Coverage (FIC), Under-5 Mortality per 1,000 live births. | [National Population Commission (NPC)](https://nationalpopulation.gov.ng) |
| **Facility Names, GPS Coordinates & Wards** | **Real Empirical Data** | Direct programmatic ingestion of 1,292 public primary facilities from the official GRID3 Nigeria dataset (`GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv`). Captures exact GPS latitudes, longitudes, NHFR facility codes, and ward boundaries. | [GRID3 Health Facility Database](https://nigeria.grid3.org/) |
| **Facility Tiering & Staffing Guidelines** | **Real Benchmark** | NPHCDA Minimum Standards for Primary Health Care in Nigeria. | [Nigeria Governors' Forum / NPHCDA Repository](http://ngfrepository.org.ng:8080/jspui/handle/123456789/3153) |
| **Weekly Stock Dynamics** | **Simulated (Mechanistic)** | Micro-simulation based on catchment population, regional disease seasonality (South vs North), and logistics resupply cycles. | Section 5 below |
| **Weekly Reporting Events** | **Simulated (Behavioral)** | Stochastic reporting model with compounding Markov decay conditioned on connectivity, staffing, and facility crisis status. | Section 5.4 below |

---

## 3. Policy, Survey & Literature Resource Base

This implementation is grounded in the following official government policies, national survey datasets, and peer-reviewed health systems research:

1. **Nigeria Demographic and Health Survey (NDHS 2018 / 2023–24)**
   - *Authoring Body:* National Population Commission (NPC) [nationalpopulation.gov.ng](https://nationalpopulation.gov.ng) & ICF International.
   - *Key Evidence Drawn:* State-level Full Immunization Coverage (FIC) by geopolitical zone (14% in Sokoto to 84% in Lagos), Antenatal Care (ANC 4+ visits), Skilled Birth Attendance (SBA), and Under-5 Mortality Rate (U5MR).
2. **Nigeria Multidimensional Poverty Index (MPI 2022) Report**
   - *Authoring Body:* National Bureau of Statistics (NBS) [nigerianstat.gov.ng](https://nigerianstat.gov.ng), in collaboration with UNDP, UNICEF, and Oxford Poverty and Human Development Initiative (OPHI).
   - *Key Evidence Drawn:* State MPI scores (0.026 to 0.562), deprivations in clean drinking water, electricity, sanitation, and living standards.
3. **Minimum Standards for Primary Health Care in Nigeria**
   - *Authoring Body:* National Primary Health Care Development Agency (NPHCDA) & Federal Ministry of Health (FMOH).
   - *Key Evidence Drawn:* Standard PHC categorization (CHC, PHC, Clinic, Health Post), minimum infrastructure packages, catchment thresholds, and staffing norms.
4. **National Task-Shifting and Task-Sharing (TSTS) Policy for Essential Health Care Services**
   - *Authoring Body:* Federal Ministry of Health (FMOH 2014, revised 2022).
   - *Key Evidence Drawn:* Legal mandate authorizing Community Health Extension Workers (CHEWs) to administer first-line ACTs, antibiotics, and clean deliveries at Health Posts and Clinics in the absence of doctors.
5. **Cold Chain Equipment Optimization Platform (CCEOP) Guidelines**
   - *Key Evidence Drawn:* Deployment standards for WHO PQS-qualified Solar Direct Drive (SDD) refrigeration units to eliminate dependence on failed electrical grids.
6. **GRID3 Nigeria (Geo-Referenced Infrastructure and Demographic Data for Development)**
   - *Authoring Body:* National Space Research and Development Agency (NASRDA), Bill & Melinda Gates Foundation, and CIESIN Columbia University.
   - *Key Evidence Drawn:* Master Health Facility coordinates, LGA polygons, settlement centroids, and road accessibility layers.
7. **WHO World Malaria Report & Africa CDC Disease Burden Profiles**
   - *Key Evidence Drawn:* Seasonal transmission peaks for *Plasmodium falciparum* across Guinea savanna, Sudan savanna, and coastal rainforest zones.

---

## 4. The "Why" Behind Every Data Point and Indicator

### 4.1 LGA Macro Indicators (`nigeria_lga_indicators.json`)

1. **`rurality_rate`**: Proportion of LGA inhabitants living in settlements without paved arterial access. Single greatest structural determinant of supply chain reliability and healthcare worker retention.
2. **`poverty_headcount_mpi`**: Calibrated to authentic NBS 2022 Multidimensional Poverty Index (MPI) values across all geopolitical zones and focal states (ranging from 0.015 in Ikeja, Lagos to 0.660 in Gujba, Yobe, with no unrealistic 0.90 values).
3. **`full_immunization_rate` (FIC %)**: Sourced from NDHS state-level metrics (ranging from 14% in Sokoto border LGAs to 84% in Ikeja, Lagos). Serves as primary indicator of preventive readiness.
4. **`anc4_coverage_rate`**: Dictates consumption velocity of maternal health commodities: Oxytocin injections and Clean Delivery Mama Kits.
5. **`under5_mortality_per_1k`**: Baseline outcome measure of child survival vulnerability.
6. **`malaria_endemicity_score` & `cholera_risk_score`**: Epidemiological drivers of commodity demand surges.
7. **`road_access_index` & `telecom_coverage_rate`**: Physical operational constraints governing logistics accessibility and mobile report transmission.

---

### 4.2 Essential Commodities Catalog (`commodities.py`)

1. **Artemether-Lumefantrine 20/120mg (AL / ACT)**:
   - *Why Tracked:* Nigeria's #1 dispensed medicine.
   - *Seasonality:* Surges during the **Rainy Season** (up to 1.85x surge).
2. **Amoxicillin 250mg Dispersible Tablets (DT)**:
   - *Why Tracked:* WHO/UNICEF IMCI first-line antibiotic for pediatric fast-breathing pneumonia.
   - *Seasonality:* Surges 1.40x during the **Harmattan / Dry Season** due to airborne particulate dust and temperature drops.
3. **Oral Rehydration Salts (ORS) + Zinc Co-pack**:
   - *Why Tracked:* Universal standard for acute watery diarrhea in under-fives.
   - *Seasonality:* Spikes 1.60x during heavy seasonal rainfall and flood-induced runoff.
4. **Oxytocin Injection 10 IU/ml**:
   - *Why Tracked:* Maternal uterotonic required post-delivery to prevent Postpartum Hemorrhage (PPH).
   - *Storage Vulnerability:* Strict 2–8°C cold chain. Degradation occurs rapidly if exposed to ambient heat.
5. **Pentavalent Vaccine (DTP-HepB-Hib)**:
   - *Why Tracked:* Routine infant immunization (administered at 6, 10, 14 weeks).
   - *Storage Vulnerability:* Strict 2–8°C requirement; ruined by freezing or ambient heat.
6. **Measles Vaccine**:
   - *Why Tracked:* Routine freeze-dried vaccine given at 9 months.
   - *Seasonality:* Outbreaks peak during the **Harmattan / Dry Season** (surge multiplier 1.50x).
7. **Malaria Rapid Diagnostic Test (mRDT)**:
   - *Why Tracked:* National malaria policy mandates "Test Before Treat" to halt artemisinin resistance.
   - *Seasonality:* Surges during the **Rainy Season** (up to 1.80x surge).
8. **Clean Delivery Mama Kits**:
   - *Why Tracked:* Sterile delivery pack (cord clamp, surgical blade, soap, mackintosh sheet) for clean childbirth.
   - *Seasonality:* Constant baseline velocity (`seasonal_peak="none"`).

---

## 5. Mechanistic Simulation Dynamics

### 5.1 Nigeria's Seasons: South vs. North Dynamics

The simulation models Nigeria's two distinct seasons with geographic differentiation between the **South** (SW, SS, SE) and **North** (NW, NE, NC):

```
                     NIGERIA'S SEASONS: REGIONAL DYNAMICS
═════════════════════════════════════════════════════════════════════════════════
1. RAINY SEASON (Malaria ACTs, RDTs, ORS+Zinc Diarrhoea)
   • South (SW, SS, SE): March/April to October/November (Weeks 12 to 46)
     - Two Peaks (Bimodal): Heaviest in June-July (Week 26), August break floor,
       and September (Week 37).
   • North (NW, NE, NC): May/June to September (Weeks 20 to 39)
     - Single Peak (Unimodal): Shorter, concentrated season peaking in July-Aug (Week 31).

2. HARMATTAN / DRY SEASON (Childhood Fast-Breathing Pneumonia, Measles Outbreaks)
   • South (SW, SS, SE): December to February (Weeks 49-52 and Weeks 1-8)
     - Milder, shorter, less intense — felt mainly Dec-Jan.
   • North (NW, NE, NC): November to March (Weeks 45-52 and Weeks 1-13)
     - Earlier, longer, more severe dry dusty Sahara trade winds (centered in Jan).
═════════════════════════════════════════════════════════════════════════════════
```

### 5.2 Stock Flow Equation
For each facility $i$, commodity $c$, and week $t$:
$$\text{Stock}_{i,c,t} = \max\Big(0, \text{Stock}_{i,c,t-1} - \text{Consumption}_{i,c,t}\Big) + \text{Resupply}_{i,c,t}$$

- **Demand Calculation**:
  $$\text{Demand}_{i,c,t} = \text{BaseRate}_c \times \frac{\text{Pop}_i}{1000} \times \text{Seasonality}_{c,t,i} \times \text{EndemicityPrior} + \epsilon$$
  where $\epsilon \sim \mathcal{N}(0, \sigma^2)$ introduces natural weekly epidemiological variability.
- **Stockout Emergence**: If $\text{Stock}_{i,c,t-1} < \text{Demand}_{i,c,t}$, consumption is capped at available stock, unmet demand is recorded, and `is_stockout = True`.

### 5.3 Logistics Resupply & Regional Monsoon Washouts
- **Urban Schedule**: Resupply cycle every 4 weeks with 88–100% order fill rate.
- **Rural Schedule**: Resupply cycle every 9 weeks with 60–88% fulfillment due to central depot quotas.
- **Regional Seasonal Washouts**: On difficult rural unpaved tracks (transport difficulty $> 0.65$), scheduled deliveries face a 45% postponement probability during peak rain windows:
  - **South**: Weeks 24–30 (June–July) and Weeks 35–39 (September).
  - **North**: Weeks 28–34 (July–August).

### 5.4 Reporting Decay and Compounding Silence
- Baseline weekly reporting probability $P_0$ is modeled as a function of facility staffing workload, GSM telecom signal, and road access:
  $$P_0 = 0.45 \times \min(1.0, \text{Staff}/6) + 0.35 \times \text{GSM} + 0.20 \times (1 - \text{TransportDifficulty})$$
- When a facility misses a report, future reporting probability decays exponentially:
  $$P(\text{Report}_t) = P_0 \times (0.72)^k$$
  where $k$ is the number of consecutive missed weeks.
- **Facility Crisis Penalty**: When $\ge 3$ commodities are stocked out simultaneously, staff face patient frustration and burnout, applying an additional 20% reporting suppression penalty.

---

## 6. Spatial Network & Cascading Risk Architecture

- **Haversine Distance Metric**: Facilities are georeferenced using true spherical trigonometry:
  $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos \phi_1 \cos \phi_2 \sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
- **Adjacency Graph ($k=3$)**: Each facility is connected to its 3 nearest neighboring facilities (generating 3,876 directed edges).
- **Overflow Weights**: Inverse distance weighting $w_{ij} = \frac{1/d_{ij}}{\sum_k 1/d_{ik}}$, modeling patient redirection dynamics when the primary facility experiences stockouts.

---

## 7. Analytical Validation Findings

The simulation produces statistically significant validation evidence mirroring real-world epidemiological findings:
1. **Silent Facilities Stockout Disparity**: Facilities that have missed $\ge 3$ consecutive reports exhibit dramatically higher true physical stockout rates compared to actively reporting facilities.
2. **Rural-Urban Gradient**: Rural facilities demonstrate higher stockout frequency, lower reporting completeness, and substantially longer data transmission delays (average 10–18 days late vs 1–3 days in urban centers).
3. **Vulnerability Concentration**: The highest ground-truth risk occurs in remote health posts and primary health clinics in high-poverty LGAs (Sokoto and Yobe) lacking solar direct drive cold-chain equipment.

---

## 8. Data Storage Architecture & Ingestion Pipeline

### 8.1 Local Storage in Apache Parquet
All structured datasets generated by the pipeline are stored in `data_layer/data/processed/` using **Apache Parquet (`.parquet`)** format:

| Artifact | File Path | Format | Records | Description |
| :--- | :--- | :---: | :---: | :--- |
| **Facility Registry** | `data_layer/data/processed/facilities.parquet` | Parquet | 1,292 rows | Master health facility registry with coordinates, staffing, power, and cold-chain status. |
| **Weekly Stock Reports** | `data_layer/data/processed/weekly_stock_reports.parquet` | Parquet | 537,472 rows | 52-week time-series of consumption, resupply, stockouts, and reporting latency per commodity. |
| **Facility Risk Features** | `data_layer/data/processed/facility_features.parquet` | Parquet | 1,292 rows | 40-dimensional risk triage feature matrix for machine learning classification. |
| **Spatial Graph Edges** | `data_layer/data/processed/facility_graph_edges.json` | JSON | 3,876 edges | Directed Haversine k-NN graph network edges ($k=3$). |

### 8.2 Two-Phase Pipeline Execution

1. **Phase 1: End-to-End Pipeline Execution (`python run_pipeline.py`)**
   - Root command executes all data generation, simulation, network construction, and feature engineering.
   - Automatically invokes database ingestion via `data_layer.db.load_to_db.init_and_load_db()` if database credentials are configured in `.env`.
   - Executes validation verification comparing silent vs. reporting facilities.

2. **Phase 2: Standalone Cloud Ingestion (`python -m data_layer.db.load_to_supabase`)**
   - Directly reads pre-computed Parquet and JSON files from `data_layer/data/processed/`.
   - Streams 537k+ rows into Supabase PostgreSQL in low-memory batches of 25,000 using `execute_values`.
