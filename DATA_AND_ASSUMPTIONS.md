# PHC Pulse: Data Layer & Assumptions Documentation

**Project:** PHC Pulse — Primary Healthcare Centre Risk Triage & Early Warning System (Nigeria)  
**Deliverable:** Core Data Layer & Modeling Assumptions Reference (Section 3.4)  
**Version:** 1.0.0 (Python Native Data Engine)

---

## 1. Executive Summary

The PHC Pulse data layer combines **grounded public health empirical data** (Nigeria Demographic and Health Survey [NDHS], National Bureau of Statistics [NBS] Multidimensional Poverty Index, WHO disease surveillance) with a **calibrated mechanistic simulation engine**.

Rather than treating data as static or assigning stockout labels randomly, the data layer simulates the underlying physical and behavioral processes of Nigeria's primary healthcare delivery:
1. **Dynamic Stock Flow**: Weekly inventory decreases via patient consumption and increases through logistics resupply. Stockouts emerge naturally when inventory hits zero.
2. **Coupled Reporting Breakdown ("Silence Compounds")**: Understaffed and rural facilities face higher operational friction. Missing one report significantly increases the probability of missing consecutive reports, creating a blind spot in conventional monitoring systems.
3. **Correlated Resource Disparities**: Rural facilities systematically possess fewer staff, limited cold-chain solar equipment, worse road connectivity, and more erratic resupply intervals.
4. **Spatial Proximity Graph**: Captures the geographical topology of facilities using precise Haversine distance, establishing the foundation for cascading overflow risk.

---

## 2. Distinction Between Real and Simulated Data

### Focal Cohort: 1 State per Geopolitical Zone
Following the **NBS 2022 Multidimensional Poverty Index (MPI)** ranking and **GRID3 Nigeria Master Facility Registry**, the data layer models 6 focused states (1 per geopolitical zone) contrasting the commercial urban benchmark against the documented most struggling states in primary healthcare delivery:
1. **South West**: **Lagos** (Urban benchmark: 12.0% MPI, high commercial density, baseline reference).
2. **North West**: **Sokoto** (Ranked #1 poorest in Nigeria: 90.5% MPI, lowest immunization coverage ~14%, severe desert/border rurality).
3. **North East**: **Yobe** (Top poorest: 83.5% MPI, conflict infrastructure destruction, zero-dose malnutrition crisis).
4. **South South**: **Bayelsa** (Ranked #2 poorest in Nigeria: 88.5% MPI, extreme riverine delta, 80%+ PHCs accessible only by motorized boat).
5. **South East**: **Ebonyi** (Ranked in top 10 poorest: 79.8% MPI, highest rurality in SE, recurrent endemic cholera and Lassa fever).
6. **North Central**: **Plateau** (Ranked in top 10 poorest: 80.5% MPI, recurrent communal crisis, health worker displacement, highland terrain).

| Component | Nature | Source / Justification | Official External Reference |
| :--- | :--- | :--- | :--- |
| **LGA Boundaries & Centroids** | **Real** | 24 LGAs across 6 representative states. | [GRID3 Data Hub](https://data.grid3.org) |
| **Multidimensional Poverty Index (MPI)** | **Real** | NBS Nigeria Multidimensional Poverty Index Survey (2022). | [NBS 2022 MPI Report](https://nigerianstat.gov.ng/elibrary/read/1241254) / [PDF Download](https://nigerianstat.gov.ng/download/1241254) |
| **Full Immunization Coverage (FIC %)** | **Real** | NDHS (2018 / 2023-24). | [DHS Program Nigeria Portal](https://dhsprogram.com/countries/country-main.cfm?ctry_id=30) |
| **Maternal & Child Health Indicators** | **Real** | NDHS: Antenatal Care (ANC 4+), Facility Deliveries, and Under-5 Mortality per 1,000 live births. | [National Population Commission (NPC)](https://nationalpopulation.gov.ng) |
| **Facility Names, GPS Coordinates & Wards** | **Real Empirical Data** | Direct programmatic ingestion of 1,292 public primary facilities from the official GRID3 Nigeria dataset (`GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv`). Captures exact GPS latitudes, longitudes, NHFR facility codes, and ward boundaries. | [GRID3 Data Hub](https://data.grid3.org) |
| **Facility Tiering & Staffing Guidelines** | **Real Benchmark** | NPHCDA Minimum Standards for Primary Health Care in Nigeria. | [Nigeria Governors' Forum / NPHCDA Repository](http://ngfrepository.org.ng:8080/jspui/handle/123456789/3153) |
| **Weekly Stock Dynamics** | **Simulated (Mechanistic)** | Micro-simulation based on catchment population, disease seasonality, and logistics resupply cycles. | Section 5 below |
| **Weekly Reporting Events** | **Simulated (Behavioral)** | Stochastic reporting model with compounding Markov decay conditioned on connectivity, staffing, and facility crisis status. | Section 5.4 below |

---

## 3. Policy, Survey & Literature Resource Base

This implementation is grounded in the following official government policies, national survey datasets, and peer-reviewed health systems research:

1. **Nigeria Demographic and Health Survey (NDHS 2018 / 2023–24)**
   - *Authoring Body:* National Population Commission (NPC) [nationalpopulation.gov.ng](https://nationalpopulation.gov.ng) & ICF International.
   - *Portal:* [DHS Program Nigeria Country Page](https://dhsprogram.com/countries/country-main.cfm?ctry_id=30).
   - *Key Evidence Drawn:* State-level Full Immunization Coverage (FIC) by geopolitical zone, Antenatal Care (ANC 4+ visits), Skilled Birth Attendance (SBA), and Under-5 Mortality Rate (U5MR).
2. **Nigeria Multidimensional Poverty Index (MPI 2022) Report**
   - *Authoring Body:* National Bureau of Statistics (NBS) [nigerianstat.gov.ng](https://nigerianstat.gov.ng), in collaboration with UNDP, UNICEF, and Oxford Poverty and Human Development Initiative (OPHI).
   - *Portal:* [NBS 2022 MPI Report (Read Online)](https://nigerianstat.gov.ng/elibrary/read/1241254) | [Direct PDF Download](https://nigerianstat.gov.ng/download/1241254) | [NBS Survey Catalog](https://microdata.nigerianstat.gov.ng/index.php/catalog/NGA-NBS-MPI-2021-v1.0).
   - *Key Evidence Drawn:* Multidimensional deprivation incidence (12% in urban Lagos to 91% in rural Sokoto), rural-urban infrastructure disparities, clean water access, and electricity availability.
3. **Minimum Standards for Primary Health Care in Nigeria**
   - *Authoring Body:* National Primary Health Care Development Agency (NPHCDA) & Federal Ministry of Health (FMOH).
   - *Repository:* [Nigeria Governors' Forum / NPHCDA Repository](http://ngfrepository.org.ng:8080/jspui/handle/123456789/3153).
   - *Key Evidence Drawn:* Standard PHC categorization (CHC, PHC, Clinic, Health Post), minimum infrastructure packages, catchment thresholds, and staffing norms.
4. **National Task-Shifting and Task-Sharing (TSTS) Policy for Essential Health Care Services**
   - *Authoring Body:* Federal Ministry of Health (FMOH 2014, revised 2022).
   - *Reference:* [Federal Ministry of Health Portal](https://fmohconnect.gov.ng).
   - *Key Evidence Drawn:* Legal mandate authorizing Community Health Extension Workers (CHEWs) to administer first-line ACTs, antibiotics, and clean deliveries at Health Posts and Clinics in the absence of doctors.
5. **Cold Chain Equipment Optimization Platform (CCEOP) Guidelines**
   - *Authoring Body:* Gavi, the Vaccine Alliance, UNICEF Supply Division, and NPHCDA.
   - *Reference:* [Gavi Cold Chain Support](https://www.gavi.org).
   - *Key Evidence Drawn:* Deployment standards for WHO PQS-qualified Solar Direct Drive (SDD) refrigeration units to eliminate dependence on failed electrical grids and kerosene equipment.
6. **GRID3 Nigeria (Geo-Referenced Infrastructure and Demographic Data for Development)**
   - *Authoring Body:* National Space Research and Development Agency (NASRDA), Bill & Melinda Gates Foundation, and CIESIN Columbia University.
   - *Portal:* [GRID3 Data Hub](https://data.grid3.org) & [GRID3 Organization](https://grid3.org).
   - *Key Evidence Drawn:* Master Health Facility coordinates, LGA bounding polygons, settlement centroids, and road accessibility layers.
7. **National Health Management Information System (NHMIS) / DHIS2 Operational Studies**
   - *Authoring Body:* Federal Ministry of Health (FMOH) & DHIS2 / Health Information Systems Programme (HISP).
   - *Reference Studies:* Ameh et al., *Evaluating NHMIS Data Quality and Timeliness in Nigerian Primary Health Care* (Pan African Medical Journal); DHIS2 Nigeria RI Dashboard.
   - *Key Evidence Drawn:* Empirical patterns of reporting decay, monthly reporting timeliness (average 45–65% timeliness in rural facilities vs >80% in urban centers), and transmission latency.
8. **WHO World Malaria Report & Africa CDC Disease Burden Profiles**
   - *Authoring Body:* World Health Organization (WHO) & Africa Centres for Disease Control and Prevention.
   - *Portal:* [WHO Global Health Observatory (GHO)](https://www.who.int/data/gho) & [Africa CDC Surveillance](https://africacdc.org).
   - *Key Evidence Drawn:* Seasonal transmission peaks for Plasmodium falciparum in sub-Saharan savanna and rainforest ecological zones.

---

## 4. The "Why" Behind Every Data Point and Indicator

### 4.1 LGA Macro Indicators (`nigeria_lga_indicators.json`)

1. **`population`**:
   - *Why It Exists:* Sets the absolute demographic scale. Facility demand for curative and preventive services is proportional to population.
   - *Formulation:* Derived from National Population Commission (NPC) census baselines projected to 2023/2024 using LGA-specific intercensal growth rates (2.8% to 3.5% annually).
2. **`rurality_rate`**:
   - *Why It Exists:* Single greatest structural determinant of supply chain reliability, health worker retention, and road access.
   - *Formulation:* Defined per NBS classification as the proportion of LGA inhabitants living in settlements under 20,000 population without paved arterial access.
3. **`poverty_headcount_mpi`**:
   - *Why It Exists:* Income poverty alone fails to measure health fragility. The Multidimensional Poverty Index accounts for direct deprivations in health, clean energy, drinking water, and living standards. Facilities in high-MPI LGAs experience weaker local revenue generation and higher logistical breakdown.
   - *Formulation:* Exact headcount percentage extracted from the NBS 2022 MPI Survey across all geopolitical zones.
4. **`full_immunization_rate` (FIC %)**:
   - *Why It Exists:* Serves as the primary indicator of routine preventive service readiness and cold-chain stability. High "zero-dose" child clusters correlate with unreached rural populations.
   - *Formulation:* Sourced from NDHS state-level FIC metrics (ranging from 14% in Sokoto border LGAs to 84% in Ikeja, Lagos).
5. **`anc4_coverage_rate` & `facility_delivery_rate`**:
   - *Why It Exists:* Dictates the consumption velocity of maternal health commodities: Oxytocin injections and Clean Delivery Mama Kits. Where institutional deliveries are low, demand is unpredictable and emergency postpartum hemorrhage (PPH) risk surges.
   - *Formulation:* Sourced from NDHS reproductive health indicators.
6. **`under5_mortality_per_1k`**:
   - *Why It Exists:* Baseline outcome measure of child survival vulnerability. A facility serving a population with 140/1,000 U5MR has zero buffer for stockouts of oral rehydration salts, antimalarials, or antibiotics.
7. **`malaria_endemicity_score` & `cholera_risk_score`**:
   - *Why It Exists:* Epidemiological drivers of commodity demand surges. Malaria accounts for ~30% of outpatient consultations in Nigeria; water-borne outbreaks spike during initial rainy season runoff.
8. **`road_access_index` & `telecom_coverage_rate`**:
   - *Why It Exists:* The two physical constraints of primary healthcare operations. Road access governs whether delivery trucks can reach the facility storeroom; telecom coverage governs whether mobile HMIS/DHIS2 data or SMS stock alerts can transmit.

---

### 4.2 Essential Commodities Catalog (`commodities.py`)

1. **Artemether-Lumefantrine 20/120mg (AL / ACT)**:
   - *Why Tracked:* Nigeria's #1 dispensed medicine; accounts for the largest share of commodity budgets.
   - *Seasonality:* Surges up to 1.85x during Weeks 20–42 (May to October) following vector breeding cycles.
2. **Amoxicillin 250mg Dispersible Tablets (DT)**:
   - *Why Tracked:* WHO/UNICEF Integrated Management of Childhood Illness (IMCI) first-line antibiotic for pediatric fast-breathing pneumonia.
   - *Seasonality:* Spikes 1.40x during the Harmattan dry season (Weeks 46–52, 1–8) due to airborne particulate matter.
3. **Oral Rehydration Salts (ORS) + Zinc Co-pack**:
   - *Why Tracked:* Universal standard for acute watery diarrhea in under-fives. Prevents dehydration death and shortens episode duration.
   - *Seasonality:* Spikes 1.60x during onset of heavy seasonal rains.
4. **Oxytocin Injection 10 IU/ml**:
   - *Why Tracked:* Life-saving uterotonic required immediately following infant delivery to prevent Postpartum Haemorrhage (PPH) — the leading cause of maternal mortality in Nigeria.
   - *Storage Vulnerability:* Strictly requires 2–8°C. Degradation occurs within days if exposed to ambient temperatures >25°C.
5. **Pentavalent Vaccine (DTP-HepB-Hib)**:
   - *Why Tracked:* Core infant vaccine (administered at 6, 10, 14 weeks).
   - *Storage Vulnerability:* Ultra-sensitive. Cannot be frozen (aluminum adjuvant precipitates and destroys potency) and cannot be heated above 8°C.
6. **Measles Vaccine**:
   - *Why Tracked:* Highly contagious viral infection; routine single dose at 9 months.
   - *Seasonality:* Outbreaks peak in Nigeria during the hot dry season (January–April).
7. **Malaria Rapid Diagnostic Test (mRDT)**:
   - *Why Tracked:* National malaria policy mandates "Test Before Treat" to halt emerging artemisinin resistance.
8. **Clean Delivery Mama Kits**:
   - *Why Tracked:* Prevents neonatal tetanus and puerperal sepsis during labor. Standard kit includes sterile blade, cord ties, antiseptic soap, and plastic sheet.

---

### 4.3 Facility Registry Attributes (`facilities.json`)

1. **Facility Tiers (CHC, PHC, Clinic, Health Post)**:
   - *Why:* Mirroring NPHCDA's Ward Minimum Health Care Package. An urban LGA concentrates large Comprehensive Health Centres; rural LGAs disperse primary clinics and remote posts.
2. **Staffing Allocation (`doctors`, `nurses_midwives`, `chews`)**:
   - *Why:* Under Nigeria's Task-Shifting and Task-Sharing Policy, medical doctors rarely work in rural primary facilities. Over 80% of rural consultations and deliveries are managed by Community Health Extension Workers (CHEWs).
   - *Formula:*
     * CHC: Urban (1–3 docs, 4–8 midwives, 8–14 CHEWs) vs Rural (0–1 docs, 2–5 midwives, 5–9 CHEWs).
     * PHC: Urban (0 docs, 2–5 midwives, 4–8 CHEWs) vs Rural (0 docs, 0–2 midwives, 2–5 CHEWs).
     * Clinic: Urban (2–5 CHEWs, 0–1 midwife) vs Rural (1–4 CHEWs, 0 midwives).
     * Health Post: 1–2 CHEWs only.
3. **Catchment Population & Monthly Targets**:
   - *Why:* Clinical programs micro-plan targets using crude birth rate demographics:
     $$\text{monthly\_under1} = \left\lfloor\frac{\text{catchment} \times 0.040}{12}\right\rfloor, \quad \text{monthly\_pregnant} = \left\lfloor\frac{\text{catchment} \times 0.048}{12}\right\rfloor$$
4. **Cold Chain Equipment (`has_cold_chain`, `cold_chain_type`)**:
   - *Why:* Grounded in Gavi CCEOP benchmarks. Solar Direct Drive (SDD) units bypass unreliable power grids. Health posts lack solar refrigeration capital and rely on passive cold boxes for outreach sessions.
5. **Baseline Reporting Probability ($P_0$)**:
   - *Why:* Addresses the core system premise: reporting failure is structural, driven by overburdened staff and poor telecom connectivity.
   - *Mathematical Formulation:*
     $$P_0 = 0.45 \times \min\left(1.0, \frac{\text{Staff}}{6}\right) + 0.35 \times \text{GSM} + 0.20 \times (1.0 - \text{TransportDifficulty})$$
     *Rationale for weights:* Staff availability represents the largest constraint (45%) — a lone CHEW attending to patients will always prioritize clinical triage over filling out monthly summary forms. GSM network connectivity (35%) dictates electronic DHIS2 transmission feasibility. Physical road access (20%) dictates whether paper registers can be physically delivered to the LGA Health Office.

---

### 4.4 Simulation Dynamics: The Compounding Decay Law

- **Why Silence Compounds ($\delta = 0.72$):**
  When a facility misses a reporting deadline, operational friction does not reset. Paper forms accumulate, administrative disengagement occurs, and LGA monitoring visits rarely reach remote posts.
  $$P(\text{Report}_t) = P_0 \times (0.72)^k$$
  After 3 missed weeks, reporting probability drops by more than $60\%$, creating an acute information blackout exactly as stock is depleting.
- **Why Logistics Fail in Weeks 28–34:**
  Corresponds to the peak West African Monsoon (July–August). In rural LGAs with unpaved feeder roads, seasonal flooding and river crossings wash out transit routes, elevating delivery postponement to 45%.

According to NPHCDA policy guidelines, healthcare centers are organized into four standard tiers:
1. **Comprehensive Health Centre (CHC)**: 
   - 1 to 3 per LGA depending on population.
   - Staffing: 12-25 staff in urban settings (including 1-3 doctors, 4-8 nurse-midwives, 8-14 CHEWs); 7-14 staff in rural settings.
   - Cold Chain: 95% equipped with functional Solar Direct Drive (SDD) or dual-power electric refrigeration.
2. **Primary Health Centre (PHC)**:
   - Typically 1 per political ward (catchment 10,000–22,000).
   - Staffing: Led by Nurse/Midwife or Senior CHEW; 6-12 staff in urban, 2-6 staff in rural.
   - Cold Chain: 90% urban vs 65% rural SDD penetration.
3. **Primary Health Clinic**:
   - Outpatient clinic serving smaller settlements (catchment 4,000–10,000).
   - Staffing: 1-4 CHEWs; rarely doctors.
   - Cold Chain: 30% rural vs 60% urban.
4. **Health Post / Dispensary**:
   - Remote village outpost (catchment 1,500–4,500).
   - Staffing: 1-2 junior CHEWs.
   - Cold Chain: Rarely equipped with active refrigerators (10-25%); relies on passive vaccine carriers during outreach campaigns.

### Correlated Disparities
To avoid synthetic data that is "too clean" or artificially uncorrelated:
- **Staffing Disparity**: Rural facilities systematically receive fewer healthcare workers due to rural retention challenges documented across Nigeria's health workforce.
- **Infrastructure Disparity**: Clean borehole water and solar power installations are calibrated to be less frequent in high-poverty, high-rurality LGAs.
- **Geographic Dispersion**: Urban facilities cluster around the LGA centroid and transit corridors; rural facilities are dispersed towards border peripheries with high transport difficulty (unpaved tracks, seasonal floods).

---

## 5. Mechanistic Simulation Dynamics

### 5.1 Essential Commodities Tracked
1. **Artemether-Lumefantrine (AL) 20/120mg**: First-line malaria ACT (seasonal multiplier 1.85x during rainy months: peaks in June / Week 25 in Southern Nigeria and August / Week 33 in Northern Nigeria).
2. **Amoxicillin 250mg DT**: Pediatric IMCI fast-breathing pneumonia treatment (seasonal multiplier 1.40x during Harmattan).
3. **ORS + Zinc Co-pack**: Pediatric diarrhea management (seasonal multiplier 1.60x during rainy season: peaks in June in Southern Nigeria and August in Northern Nigeria).
4. **Oxytocin Injection 10 IU/ml**: Heat-sensitive maternal uterotonic for postpartum hemorrhage (PPH) prevention. Strict 2-8°C storage requirement.
5. **Pentavalent Vaccine (DTP-HepB-Hib)**: Infant routine EPI vaccine. Strict 2-8°C requirement.
6. **Measles Vaccine**: Freeze-dried routine EPI vaccine (peaks in dry season).
7. **Malaria Rapid Diagnostic Tests (RDTs)**: Diagnostic requirement before dispensing ACTs (mirrors malaria rainy surge).
8. **Clean Delivery Mama Kits**: Sterile cord ties, blades, and surgical sheets for safe childbirth.

### 5.2 Stock Flow Equation
For each facility $i$, commodity $c$, and week $t$:
$$\text{Stock}_{i,c,t} = \max\Big(0, \text{Stock}_{i,c,t-1} - \text{Consumption}_{i,c,t}\Big) + \text{Resupply}_{i,c,t}$$

- **Demand Calculation**:
  $$\text{Demand}_{i,c,t} = \text{BaseRate}_c \times \frac{\text{Pop}_i}{1000} \times \text{Seasonality}_{c,t} \times \text{EndemicityPrior} + \epsilon$$
  where $\epsilon \sim \mathcal{N}(0, \sigma^2)$ introduces natural weekly epidemiological variability.
- **Stockout Emergence**: If $\text{Stock}_{i,c,t-1} < \text{Demand}_{i,c,t}$, consumption is capped at available stock, unmet demand is recorded, and `is_stockout = True`. The stockout is an emergent consequence of supply failing to meet demand.

### 5.3 Logistics and Resupply Friction
- **Urban Schedule**: Resupply cycle every 4-5 weeks with 88-100% order fill rate and minimal lead-time variance.
- **Rural Schedule**: Resupply cycle every 8-12 weeks with 60-88% fulfillment due to central depot quotas.
- **Seasonal Washout Interruption**: In peak monsoon weeks (Weeks 28 to 34), rural facilities with transport access difficulty $> 0.65$ face a 45% probability of scheduled delivery failure or postponement.

### 5.4 Reporting Decay and Compounding Silence
A core design requirement: **reporting gaps are a signal, not a nuisance**.
- Baseline weekly reporting probability $P_0$ is modeled as a function of facility staffing workload, GSM telecom signal, and road access:
  $$P_0 = 0.45 \times \min(1.0, \text{Staff}/6) + 0.35 \times \text{GSM} + 0.20 \times (1 - \text{TransportDifficulty})$$
- When a facility misses a report, the probability of submitting subsequent reports decays exponentially:
  $$P(\text{Report}_t) = P_0 \times (\delta)^{k}$$
  where $\delta = 0.72$ is the decay parameter and $k$ is the number of consecutive missed weeks.
- **Facility Crisis Penalty**: When $\ge 3$ commodities are stocked out simultaneously, staff face burnout and patient frustration, applying an additional 20% reporting suppression penalty.
- **Resulting Information Asymmetry**: The health management information system (DHIS2) receives no new data from silent facilities. Their last reported stock sits unchanged in official records while true physical inventory hits zero.

---

## 6. Spatial Network & Cascading Risk Architecture

- **Haversine Distance Metric**: Facilities are georeferenced using true spherical trigonometry:
  $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos \phi_1 \cos \phi_2 \sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
- **Adjacency Graph ($k=3$)**: Each facility is connected to its 3 nearest neighboring facilities.
- **Overflow Weights**: Inverse distance weighting $w_{ij} = \frac{1/d_{ij}}{\sum_k 1/d_{ik}}$, modeling patient redirection dynamics when the primary facility experiences stockouts.
- **Capacity Buffer Score**: Measures neighbor staff and catchment ratios to determine whether the neighboring facility has sufficient capacity to absorb displaced demand.

---

## 7. Analytical Validation Findings

The simulation produces statistically significant validation evidence mirroring real-world epidemiological findings:
1. **Silent Facilities Stockout Disparity**: Facilities that have missed $\ge 3$ consecutive reports exhibit dramatically higher true physical stockout rates compared to actively reporting facilities.
2. **Rural-Urban Gradient**: Rural facilities demonstrate higher stockout frequency, lower reporting completeness, and substantially longer data transmission delays (average 10-18 days late vs 1-3 days in urban centers).
3. **Vulnerability Concentration**: The highest ground-truth risk occurs in remote health posts and primary health clinics in high-poverty LGAs lacking solar direct drive cold-chain equipment.
