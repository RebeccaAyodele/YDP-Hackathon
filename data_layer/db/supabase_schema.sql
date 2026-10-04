/*
PHC Pulse: Supabase PostgreSQL Database Schema
Defines tables, relationships, indexes, and row level security policies.
*/

DROP TABLE IF EXISTS weekly_stock_reports CASCADE;
DROP TABLE IF EXISTS facility_graph_edges CASCADE;
DROP TABLE IF EXISTS facility_features CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;
DROP TABLE IF EXISTS nigeria_lga_indicators CASCADE;
DROP TABLE IF EXISTS essential_commodities CASCADE;

-- 1. Nigeria LGA Indicators
CREATE TABLE IF NOT EXISTS nigeria_lga_indicators (
    lga_id TEXT PRIMARY KEY,
    lga_name TEXT NOT NULL,
    state TEXT NOT NULL,
    geopolitical_zone TEXT NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    centroid_lon DOUBLE PRECISION NOT NULL,
    rurality_rate DOUBLE PRECISION NOT NULL,
    poverty_headcount_mpi DOUBLE PRECISION NOT NULL,
    full_immunization_rate DOUBLE PRECISION NOT NULL,
    anc4_coverage_rate DOUBLE PRECISION NOT NULL,
    under5_mortality_per_1k DOUBLE PRECISION NOT NULL,
    malaria_endemicity_score DOUBLE PRECISION NOT NULL,
    cholera_risk_score DOUBLE PRECISION NOT NULL,
    road_access_index DOUBLE PRECISION NOT NULL,
    telecom_coverage_rate DOUBLE PRECISION NOT NULL
);

-- 2. Essential Commodities Catalog
CREATE TABLE IF NOT EXISTS essential_commodities (
    commodity_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    requires_cold_chain BOOLEAN NOT NULL DEFAULT FALSE,
    unit TEXT NOT NULL,
    base_weekly_per_1k DOUBLE PRECISION NOT NULL,
    seasonal_peak TEXT NOT NULL,
    seasonal_multiplier DOUBLE PRECISION NOT NULL,
    criticality_score DOUBLE PRECISION NOT NULL,
    description TEXT
);

-- 3. Facilities Registry
CREATE TABLE IF NOT EXISTS facilities (
    facility_id TEXT PRIMARY KEY,
    facility_name TEXT NOT NULL,
    facility_type TEXT NOT NULL,
    lga_id TEXT NOT NULL,
    lga_name TEXT NOT NULL,
    state TEXT NOT NULL,
    geopolitical_zone TEXT NOT NULL,
    ward TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_rural BOOLEAN NOT NULL DEFAULT FALSE,
    catchment_population INTEGER NOT NULL,
    monthly_under1_target INTEGER NOT NULL,
    monthly_pregnant_target INTEGER NOT NULL,
    total_staff INTEGER NOT NULL DEFAULT 0,
    nurses_midwives_count INTEGER NOT NULL DEFAULT 0,
    chew_count INTEGER NOT NULL DEFAULT 0,
    doctors_count INTEGER NOT NULL DEFAULT 0,
    has_cold_chain BOOLEAN NOT NULL DEFAULT FALSE,
    cold_chain_type TEXT,
    has_solar_power BOOLEAN NOT NULL DEFAULT FALSE,
    has_borehole_water BOOLEAN NOT NULL DEFAULT FALSE,
    transport_access_difficulty DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    gsm_connectivity_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    baseline_reporting_prob DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    nhfr_facility_code TEXT,
    ownership TEXT DEFAULT 'Public',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Facility Risk Features
CREATE TABLE IF NOT EXISTS facility_features (
    facility_id TEXT PRIMARY KEY REFERENCES facilities(facility_id) ON DELETE CASCADE,
    facility_name TEXT NOT NULL,
    facility_type TEXT NOT NULL,
    lga_id TEXT NOT NULL,
    lga_name TEXT NOT NULL,
    state TEXT NOT NULL,
    geopolitical_zone TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    weeks_since_last_report INTEGER NOT NULL,
    reporting_completeness_4w DOUBLE PRECISION NOT NULL,
    reporting_completeness_12w DOUBLE PRECISION NOT NULL,
    reporting_trend DOUBLE PRECISION NOT NULL,
    is_silent_decaying BOOLEAN NOT NULL,
    avg_reporting_delay_days DOUBLE PRECISION NOT NULL,
    reported_stock_to_consumption_ratio DOUBLE PRECISION NOT NULL,
    estimated_effective_stock_weeks DOUBLE PRECISION NOT NULL,
    reported_stockout_rate_12w DOUBLE PRECISION NOT NULL,
    is_rural INTEGER NOT NULL,
    total_staff INTEGER NOT NULL,
    nurses_midwives_count INTEGER NOT NULL,
    chew_count INTEGER NOT NULL,
    doctors_count INTEGER NOT NULL,
    has_cold_chain INTEGER NOT NULL,
    has_solar_power INTEGER NOT NULL,
    has_borehole_water INTEGER NOT NULL,
    catchment_population INTEGER NOT NULL,
    transport_access_difficulty DOUBLE PRECISION NOT NULL,
    gsm_connectivity_score DOUBLE PRECISION NOT NULL,
    lga_poverty_mpi DOUBLE PRECISION NOT NULL,
    lga_full_immunization_rate DOUBLE PRECISION NOT NULL,
    lga_anc4_coverage_rate DOUBLE PRECISION NOT NULL,
    lga_under5_mortality_per_1k DOUBLE PRECISION NOT NULL,
    lga_malaria_endemicity_score DOUBLE PRECISION NOT NULL,
    lga_cholera_risk_score DOUBLE PRECISION NOT NULL,
    lga_road_access_index DOUBLE PRECISION NOT NULL,
    ground_truth_stockout_any INTEGER NOT NULL,
    ground_truth_stockout_count INTEGER NOT NULL,
    ground_truth_critical_stockout INTEGER NOT NULL,
    ground_truth_risk_score DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Facility Graph Edges
CREATE TABLE IF NOT EXISTS facility_graph_edges (
    source_facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    target_facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    distance_km DOUBLE PRECISION NOT NULL,
    same_lga BOOLEAN NOT NULL,
    same_state BOOLEAN NOT NULL,
    overflow_weight DOUBLE PRECISION NOT NULL,
    target_capacity_score DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (source_facility_id, target_facility_id)
);

-- 6. Weekly Stock Reports
CREATE TABLE IF NOT EXISTS weekly_stock_reports (
    id BIGSERIAL PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES facilities(facility_id) ON DELETE CASCADE,
    lga_id TEXT NOT NULL,
    week_number INTEGER NOT NULL,
    commodity_id TEXT NOT NULL,
    commodity_name TEXT NOT NULL,
    requires_cold_chain BOOLEAN NOT NULL,
    beginning_stock DOUBLE PRECISION NOT NULL,
    simulated_demand DOUBLE PRECISION NOT NULL,
    actual_consumption DOUBLE PRECISION NOT NULL,
    resupply_received DOUBLE PRECISION NOT NULL,
    ending_stock DOUBLE PRECISION NOT NULL,
    is_stockout BOOLEAN NOT NULL,
    days_stocked_out INTEGER NOT NULL,
    unmet_demand DOUBLE PRECISION NOT NULL,
    cold_chain_breach BOOLEAN NOT NULL,
    report_submitted BOOLEAN NOT NULL,
    consecutive_reports_missed INTEGER NOT NULL,
    reported_stock DOUBLE PRECISION,
    reported_consumption DOUBLE PRECISION,
    reported_days_stocked_out DOUBLE PRECISION,
    report_delay_days DOUBLE PRECISION
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fac_state_zone ON facilities(state, geopolitical_zone);
CREATE INDEX IF NOT EXISTS idx_fac_lga ON facilities(lga_id);
CREATE INDEX IF NOT EXISTS idx_fac_coords ON facilities(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_fac_type ON facilities(facility_type);

CREATE INDEX IF NOT EXISTS idx_reports_fac_week ON weekly_stock_reports(facility_id, week_number);
CREATE INDEX IF NOT EXISTS idx_reports_week_comm ON weekly_stock_reports(week_number, commodity_id);
CREATE INDEX IF NOT EXISTS idx_reports_lga ON weekly_stock_reports(lga_id);
CREATE INDEX IF NOT EXISTS idx_reports_stockout ON weekly_stock_reports(is_stockout) WHERE is_stockout = TRUE;
CREATE INDEX IF NOT EXISTS idx_reports_submitted ON weekly_stock_reports(report_submitted);

CREATE INDEX IF NOT EXISTS idx_feat_risk ON facility_features(ground_truth_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_feat_silent ON facility_features(is_silent_decaying) WHERE is_silent_decaying = TRUE;
CREATE INDEX IF NOT EXISTS idx_feat_lga ON facility_features(lga_id);

CREATE INDEX IF NOT EXISTS idx_edge_src ON facility_graph_edges(source_facility_id);
CREATE INDEX IF NOT EXISTS idx_edge_tgt ON facility_graph_edges(target_facility_id);

-- Row Level Security
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_stock_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE nigeria_lga_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE essential_commodities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read facilities" ON facilities FOR SELECT USING (true);
CREATE POLICY "Allow public read features" ON facility_features FOR SELECT USING (true);
CREATE POLICY "Allow public read graph edges" ON facility_graph_edges FOR SELECT USING (true);
CREATE POLICY "Allow public read weekly reports" ON weekly_stock_reports FOR SELECT USING (true);
CREATE POLICY "Allow public read lga indicators" ON nigeria_lga_indicators FOR SELECT USING (true);
CREATE POLICY "Allow public read commodities" ON essential_commodities FOR SELECT USING (true);

CREATE POLICY "Allow service role all facilities" ON facilities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all features" ON facility_features FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all graph edges" ON facility_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all weekly reports" ON weekly_stock_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all lga indicators" ON nigeria_lga_indicators FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role all commodities" ON essential_commodities FOR ALL TO service_role USING (true) WITH CHECK (true);
