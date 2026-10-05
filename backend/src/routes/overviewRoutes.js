import express from 'express';
import { getFacilities, getLgaIndicators } from '../services/dataLoader.js';

const router = express.Router();

// GET /api/overview/stats - aggregated stats for the dashboard header
router.get('/stats', (req, res) => {
  const facilities = getFacilities();
  const lgas = getLgaIndicators();

  const totalFacilities = facilities.length;
  const ruralFacilities = facilities.filter(f => f.is_rural).length;
  const coldChainCount = facilities.filter(f => f.has_cold_chain).length;

  const states = [...new Set(facilities.map(f => f.state_name))];

  // Group by State
  const byState = states.map(state => {
    const stateFacilities = facilities.filter(f => f.state_name === state);
    return {
      state,
      zone: stateFacilities[0]?.geopolitical_zone || 'Unknown',
      facility_count: stateFacilities.length,
      rural_ratio: (stateFacilities.filter(f => f.is_rural).length / stateFacilities.length).toFixed(2),
      cold_chain_ratio: (stateFacilities.filter(f => f.has_cold_chain).length / stateFacilities.length).toFixed(2),
    };
  });

  res.json({
    total_facilities: totalFacilities,
    states_count: states.length,
    rural_facilities_count: ruralFacilities,
    cold_chain_count: coldChainCount,
    by_state: byState,
    lga_count: Object.keys(lgas).length,
  });
});

export default router;
