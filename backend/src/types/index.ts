export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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

export interface ScoredFacility extends FacilityRecord {
  base_risk_score: number;
  adjusted_cascading_score?: number;
  risk_tier: RiskTier;
  is_silent: boolean;
  top_reason_summary: string;
  detailed_reasons: string[];
  risk_factors: RiskFactor[];
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
