const API_BASE = '/api';

export async function fetchOverviewStats() {
  const res = await fetch(`${API_BASE}/overview/stats`);
  if (!res.ok) throw new Error('Failed to fetch overview stats');
  return res.json();
}

export async function fetchFacilities(filters = {}) {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.lga) params.append('lga', filters.lga);
  if (filters.facility_type) params.append('facility_type', filters.facility_type);
  if (filters.is_rural !== undefined) params.append('is_rural', filters.is_rural);
  if (filters.has_cold_chain !== undefined) params.append('has_cold_chain', filters.has_cold_chain);

  const url = `${API_BASE}/facilities${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch facilities');
  return res.json();
}

export async function fetchFacilityById(id) {
  const res = await fetch(`${API_BASE}/facilities/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch facility ${id}`);
  return res.json();
}

export async function simulateCascadingRisk(facilityId, shockMagnitude = 30) {
  const res = await fetch(`${API_BASE}/simulation/cascading`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facility_id: facilityId, shock_magnitude: shockMagnitude })
  });
  if (!res.ok) throw new Error('Failed to run cascading simulation');
  return res.json();
}
