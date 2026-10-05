export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  factor: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  points: number;
}

export interface Facility {
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
  total_staff: number;
  nurses_midwives_count: number;
  chew_count: number;
  doctors_count: number;
  has_cold_chain: boolean;
  cold_chain_type?: string;
  has_solar_power: boolean;
  transport_access_difficulty: number;
  gsm_connectivity_score: number;
  nhfr_facility_code?: string;
  ownership?: string;
  base_risk_score: number;
  adjusted_cascading_score?: number;
  risk_tier: RiskTier;
  is_silent: boolean;
  top_reason_summary: string;
  detailed_reasons: string[];
  risk_factors: RiskFactor[];
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

export interface FacilityDetailResponse {
  facility: Facility;
  network: {
    nearest_neighbors_count: number;
    neighbors: NeighborDetail[];
  };
}

export interface OverviewStats {
  total_facilities: number;
  states_count: number;
  critical_risk_count: number;
  high_risk_count: number;
  silent_facilities_count: number;
  rural_facilities_count: number;
  cold_chain_count: number;
  lga_count: number;
  by_state: Array<{
    state: string;
    zone: string;
    facility_count: number;
    critical_count: number;
    silent_count: number;
    rural_ratio: number;
    cold_chain_ratio: number;
  }>;
}

export interface CascadingSimulationResponse {
  simulated_source_facility: {
    facility_id: string;
    facility_name: string;
    applied_shock_points: number;
  };
  affected_neighbors: Array<{
    facility_id: string;
    facility_name: string;
    distance_km: number;
    overflow_weight: number;
    original_base_risk: number;
    propagated_risk_increase: number;
    new_adjusted_risk: number;
    jumped_to_critical: boolean;
  }>;
}
