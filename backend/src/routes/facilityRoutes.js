import express from 'express';
import { getFacilities, getFacilityGraphEdges } from '../services/dataLoader.js';

const router = express.Router();

// GET /api/facilities - list facilities with optional query filters
router.get('/', (req, res) => {
  const { state, lga, facility_type, is_rural, has_cold_chain } = req.query;
  let facilities = getFacilities();

  if (state) {
    facilities = facilities.filter(f => f.state_name?.toLowerCase() === state.toLowerCase());
  }
  if (lga) {
    facilities = facilities.filter(f => f.lga_name?.toLowerCase() === lga.toLowerCase());
  }
  if (facility_type) {
    facilities = facilities.filter(f => f.facility_type === facility_type);
  }
  if (is_rural !== undefined) {
    const ruralBool = is_rural === 'true' || is_rural === '1';
    facilities = facilities.filter(f => f.is_rural === ruralBool);
  }
  if (has_cold_chain !== undefined) {
    const coldBool = has_cold_chain === 'true' || has_cold_chain === '1';
    facilities = facilities.filter(f => f.has_cold_chain === coldBool);
  }

  res.json({
    count: facilities.length,
    facilities
  });
});

// GET /api/facilities/:id - get single facility with its neighbors
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const facilities = getFacilities();
  const edges = getFacilityGraphEdges();

  const facility = facilities.find(f => f.facility_id === id);
  if (!facility) {
    return res.status(404).json({ error: 'Facility not found' });
  }

  const facilityEdges = edges.filter(e => e.source_id === id);
  const neighborIds = facilityEdges.map(e => e.target_id);
  const neighbors = facilities.filter(f => neighborIds.includes(f.facility_id));

  res.json({
    facility,
    neighbors: facilityEdges.map(edge => {
      const neighborInfo = neighbors.find(n => n.facility_id === edge.target_id);
      return {
        ...neighborInfo,
        distance_km: edge.distance_km,
        coupling_weight: edge.coupling_weight
      };
    })
  });
});

export default router;
