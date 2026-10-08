export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CommodityStatus {
  commodity_id: string;
  name: string;
  category: string;
  unit: string;
  status: 'ADEQUATE' | 'LOW' | 'STOCKOUT';
  estimated_days_remaining: number;
  is_cold_chain_required: boolean;
}

export interface FacilityRecord {
  facility_id: string;
  facility_name: string;
  facility_type: string;
  lga_id: string;
  lga_name: string;
  state: string;
  geopolitical_zone: string;
  ward?: string;
  latitude: number;
  longitude: number;
  is_rural: boolean;
  catchment_population: number;
  monthly_under1_target?: number;
  monthly_pregnant_target?: number;
  total_staff: number;
  nurses_midwives_count: number;
  chew_count: number;
  doctors_count: number;
  has_cold_chain: boolean;
  cold_chain_type?: string;
  has_solar_power: boolean;
  has_borehole_water?: boolean;
  transport_access_difficulty: number;
  gsm_connectivity_score: number;
  baseline_reporting_prob: number;
  nhfr_facility_code?: string;
  ownership?: string;
}

export interface GraphEdge {
  source_facility_id: string;
  target_facility_id: string;
  distance_km: number;
  same_lga: boolean;
  same_state: boolean;
  overflow_weight: number;
  target_capacity_score: number;
}

export interface RiskFactor {
  factor: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  points: number;
}

export interface FacilityFeatures {
  facility_id: string;
  facility_name: string;
  facility_type: string;
  lga_id: string;
  lga_name: string;
  state: string;
  geopolitical_zone: string;
  latitude: number;
  longitude: number;
  weeks_since_last_report: number;
  reporting_completeness_4w: number;
  reporting_completeness_12w: number;
  reporting_trend: number;
  is_silent_decaying: boolean;
  avg_reporting_delay_days: number;
  reported_stock_to_consumption_ratio: number;
  estimated_effective_stock_weeks: number;
  reported_stockout_rate_12w: number;
  is_rural: number;
  total_staff: number;
  nurses_midwives_count: number;
  chew_count: number;
  doctors_count: number;
  has_cold_chain: number;
  has_solar_power: number;
  has_borehole_water: number;
  catchment_population: number;
  transport_access_difficulty: number;
  gsm_connectivity_score: number;
  lga_poverty_mpi: number;
  lga_full_immunization_rate: number;
  lga_anc4_coverage_rate: number;
  lga_under5_mortality_per_1k: number;
  lga_malaria_endemicity_score: number;
  lga_cholera_risk_score: number;
  lga_road_access_index: number;
  ground_truth_stockout_any: number;
  ground_truth_stockout_count: number;
  ground_truth_critical_stockout: number;
  ground_truth_risk_score: number;
}

export interface FacilityInventoryItem {
  commodity_id: string;
  name: string;
  requires_cold_chain: boolean;
  ending_stock: number;
  actual_consumption: number;
  is_stockout: boolean;
  days_stocked_out: number;
  unmet_demand: number;
  cold_chain_breach: boolean;
}

export interface ScoredFacility extends FacilityRecord {
  base_risk_score: number;
  adjusted_cascading_score?: number;
  is_hidden_risk?: boolean;
  risk_tier: RiskTier;
  is_silent: boolean;
  weeks_since_last_report?: number;
  reporting_completeness_4w?: number;
  estimated_effective_stock_weeks?: number;
  ground_truth_stockout_count?: number;
  ground_truth_critical_stockout?: boolean;
  top_reason_summary: string;
  detailed_reasons: string[];
  risk_factors: RiskFactor[];
  commodities?: CommodityStatus[];
  features?: FacilityFeatures;
}

export interface LGAContext {
  lga_id: string;
  lga_name: string;
  state_name: string;
  geopolitical_zone: string;
  poverty_mpi_2022: number;
  poverty_headcount_h: number;
  poverty_intensity_a: number;
  estimated_population: number;
  rural_share: number;
  penta3_coverage_pct: number;
  anc4_coverage_pct: number;
}

export interface NeighborDetail {
  facility_id: string;
  facility_name: string;
  facility_type?: string;
  distance_km: number;
  overflow_weight: number;
  target_capacity_score: number;
  neighbor_base_risk: number;
  neighbor_risk_tier: RiskTier;
  has_cold_chain: boolean;
  total_staff: number;
}
