import express, { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { getFacilityGraphEdges } from '../services/dataLoader.js';

const router = express.Router();

router.post('/cascading', (req: Request, res: Response) => {
  try {
    const { facility_id, shock_magnitude = 35 } = req.body;
    const facilities = getScoredFacilities();
    const edges = getFacilityGraphEdges();

    const targetFacility = facilities.find(f => f.facility_id === facility_id);
    if (!targetFacility) {
      return res.status(404).json({ error: 'Target facility not found', facility_id });
    }

    const directEdges = edges.filter(e => e.source_facility_id === facility_id);

    const affectedNeighbors = directEdges.map(edge => {
      const neighbor = facilities.find(f => f.facility_id === edge.target_facility_id);
      const addedRisk = Math.round(shock_magnitude * edge.overflow_weight);
      const originalScore = neighbor?.base_risk_score ?? 0;
      const newAdjustedScore = Math.min(100, originalScore + addedRisk);

      return {
        facility_id: edge.target_facility_id,
        facility_name: neighbor?.facility_name || 'Unknown Facility',
        distance_km: edge.distance_km,
        overflow_weight: edge.overflow_weight,
        target_capacity_score: edge.target_capacity_score,
        original_base_risk: originalScore,
        propagated_risk_increase: addedRisk,
        new_adjusted_risk: newAdjustedScore,
        jumped_to_critical: newAdjustedScore >= 70 && originalScore < 70,
      };
    });

    res.json({
      simulated_source_facility: {
        facility_id: targetFacility.facility_id,
        facility_name: targetFacility.facility_name,
        applied_shock_points: shock_magnitude,
      },
      affected_neighbors: affectedNeighbors,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to run cascading simulation', message: error.message });
  }
});

export default router;
