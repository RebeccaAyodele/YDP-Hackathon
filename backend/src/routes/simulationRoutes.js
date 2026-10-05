import express from 'express';
import { getFacilities, getFacilityGraphEdges } from '../services/dataLoader.js';

const router = express.Router();

// POST /api/simulation/cascading - simulate neighbor risk propagation
router.post('/cascading', (req, res) => {
  const { facility_id, shock_magnitude = 30 } = req.body;
  const facilities = getFacilities();
  const edges = getFacilityGraphEdges();

  const targetFacility = facilities.find(f => f.facility_id === facility_id);
  if (!targetFacility) {
    return res.status(404).json({ error: 'Target facility not found' });
  }

  // Find 1-hop and 2-hop downstream neighbors
  const directEdges = edges.filter(e => e.source_id === facility_id);
  const directNeighborIds = directEdges.map(e => e.target_id);

  const affectedNeighbors = directEdges.map(edge => {
    const neighbor = facilities.find(f => f.facility_id === edge.target_id);
    const addedRisk = Math.round(shock_magnitude * edge.coupling_weight);
    return {
      facility_id: edge.target_id,
      facility_name: neighbor?.facility_name,
      distance_km: edge.distance_km,
      coupling_weight: edge.coupling_weight,
      propagated_risk_increase: addedRisk,
    };
  });

  res.json({
    simulated_facility: {
      facility_id: targetFacility.facility_id,
      facility_name: targetFacility.facility_name,
      applied_shock: shock_magnitude,
    },
    affected_neighbors: affectedNeighbors,
  });
});

export default router;
