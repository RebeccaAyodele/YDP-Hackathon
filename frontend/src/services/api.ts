import { Facility, FacilityDetailResponse, OverviewStats, CascadingSimulationResponse } from '../types/index.js';

const API_BASE = '/api';

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const res = await fetch(`${API_BASE}/overview/stats`);
  if (!res.ok) throw new Error('Failed to fetch overview stats');
  return res.json();
}

export interface FacilityFilters {
  state?: string;
  lga?: string;
  facility_type?: string;
  risk_tier?: string;
  is_silent?: boolean | string;
  is_rural?: boolean | string;
  has_cold_chain?: boolean | string;
  search?: string;
  sort_by?: string;
  page?: number;
  limit?: number;
}

export interface FacilitiesListResponse {
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
  filter_summary: {
    critical_risk: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    silent_facilities: number;
  };
  facilities: Facility[];
}

export async function fetchFacilities(filters: FacilityFilters = {}): Promise<FacilitiesListResponse> {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.lga) params.append('lga', filters.lga);
  if (filters.facility_type) params.append('facility_type', filters.facility_type);
  if (filters.risk_tier) params.append('risk_tier', filters.risk_tier);
  if (filters.is_silent !== undefined) params.append('is_silent', String(filters.is_silent));
  if (filters.is_rural !== undefined) params.append('is_rural', String(filters.is_rural));
  if (filters.has_cold_chain !== undefined) params.append('has_cold_chain', String(filters.has_cold_chain));
  if (filters.search) params.append('search', filters.search);
  if (filters.sort_by) params.append('sort_by', filters.sort_by);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));

  const url = `${API_BASE}/facilities${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch facilities');
  return res.json();
}

export async function fetchFacilityById(id: string): Promise<FacilityDetailResponse> {
  const res = await fetch(`${API_BASE}/facilities/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch facility ${id}`);
  return res.json();
}

export async function simulateCascadingRisk(facilityId: string, shockMagnitude: number = 35): Promise<CascadingSimulationResponse> {
  const res = await fetch(`${API_BASE}/simulation/cascading`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facility_id: facilityId, shock_magnitude: shockMagnitude })
  });
  if (!res.ok) throw new Error('Failed to run cascading simulation');
  return res.json();
}
