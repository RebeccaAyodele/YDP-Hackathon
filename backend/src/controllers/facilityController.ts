import { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { getFacilityGraphEdges } from '../services/dataLoader.js';
import { NeighborDetail, ScoredFacility } from '../types/index.js';

export function getFacilitiesList(req: Request, res: Response) {
  try {
    let facilities: ScoredFacility[] = getScoredFacilities();
    const {
      state,
      lga,
      facility_type,
      risk_tier,
      is_silent,
      is_rural,
      has_cold_chain,
      search,
      sort_by = 'risk_desc',
      page = '1',
      limit = '50'
    } = req.query as Record<string, string>;

    if (state) {
      facilities = facilities.filter(f => f.state?.toLowerCase() === state.toLowerCase());
    }
    if (lga) {
      facilities = facilities.filter(f => f.lga_name?.toLowerCase() === lga.toLowerCase() || f.lga_id === lga);
    }
    if (facility_type) {
      facilities = facilities.filter(f => f.facility_type === facility_type);
    }
    if (risk_tier) {
      facilities = facilities.filter(f => f.risk_tier.toLowerCase() === risk_tier.toLowerCase());
    }
    if (is_silent !== undefined) {
      const silentBool = is_silent === 'true' || is_silent === '1';
      facilities = facilities.filter(f => f.is_silent === silentBool);
    }
    if (is_rural !== undefined) {
      const ruralBool = is_rural === 'true' || is_rural === '1';
      facilities = facilities.filter(f => f.is_rural === ruralBool);
    }
    if (has_cold_chain !== undefined) {
      const coldBool = has_cold_chain === 'true' || has_cold_chain === '1';
      facilities = facilities.filter(f => f.has_cold_chain === coldBool);
    }
    if (search) {
      const q = search.toLowerCase();
      facilities = facilities.filter(f => 
        f.facility_name.toLowerCase().includes(q) ||
        f.lga_name.toLowerCase().includes(q) ||
        (f.ward && f.ward.toLowerCase().includes(q)) ||
        (f.nhfr_facility_code && f.nhfr_facility_code.toLowerCase().includes(q))
      );
    }

    if (sort_by === 'risk_desc') {
      facilities.sort((a, b) => b.base_risk_score - a.base_risk_score);
    } else if (sort_by === 'risk_asc') {
      facilities.sort((a, b) => a.base_risk_score - b.base_risk_score);
    } else if (sort_by === 'name') {
      facilities.sort((a, b) => a.facility_name.localeCompare(b.facility_name));
    } else if (sort_by === 'staff') {
      facilities.sort((a, b) => (b.total_staff || 0) - (a.total_staff || 0));
    }

    const totalCount = facilities.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedFacilities = facilities.slice(startIndex, startIndex + limitNum);

    const criticalCount = facilities.filter(f => f.risk_tier === 'CRITICAL').length;
    const highCount = facilities.filter(f => f.risk_tier === 'HIGH').length;
    const mediumCount = facilities.filter(f => f.risk_tier === 'MEDIUM').length;
    const lowCount = facilities.filter(f => f.risk_tier === 'LOW').length;
    const silentCount = facilities.filter(f => f.is_silent).length;

    res.json({
      total_count: totalCount,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(totalCount / limitNum),
      filter_summary: {
        critical_risk: criticalCount,
        high_risk: highCount,
        medium_risk: mediumCount,
        low_risk: lowCount,
        silent_facilities: silentCount,
      },
      facilities: paginatedFacilities,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve facilities', message: error.message });
  }
}

export function getFacilityDetails(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const facilities = getScoredFacilities();
    const edges = getFacilityGraphEdges();

    const facility = facilities.find(f => f.facility_id === id);
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found', facility_id: id });
    }

    const facilityEdges = edges.filter(e => e.source_facility_id === id);
    const neighborDetails: NeighborDetail[] = facilityEdges.map(edge => {
      const neighbor = facilities.find(f => f.facility_id === edge.target_facility_id);
      return {
        facility_id: edge.target_facility_id,
        facility_name: neighbor?.facility_name || 'Unknown Facility',
        facility_type: neighbor?.facility_type,
        distance_km: edge.distance_km,
        overflow_weight: edge.overflow_weight,
        target_capacity_score: edge.target_capacity_score,
        neighbor_base_risk: neighbor?.base_risk_score ?? 0,
        neighbor_risk_tier: neighbor?.risk_tier ?? 'LOW',
        has_cold_chain: neighbor?.has_cold_chain ?? false,
        total_staff: neighbor?.total_staff ?? 0,
      };
    });

    res.json({
      facility,
      network: {
        nearest_neighbors_count: neighborDetails.length,
        neighbors: neighborDetails,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve facility details', message: error.message });
  }
}
