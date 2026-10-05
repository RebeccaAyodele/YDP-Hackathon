import express, { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { getLgaIndicators } from '../services/dataLoader.js';

const router = express.Router();

router.get('/stats', (req: Request, res: Response) => {
  try {
    const facilities = getScoredFacilities();
    const lgas = getLgaIndicators();

    const totalFacilities = facilities.length;
    const ruralFacilities = facilities.filter(f => f.is_rural).length;
    const coldChainCount = facilities.filter(f => f.has_cold_chain).length;
    const criticalCount = facilities.filter(f => f.risk_tier === 'CRITICAL').length;
    const highCount = facilities.filter(f => f.risk_tier === 'HIGH').length;
    const silentCount = facilities.filter(f => f.is_silent).length;

    const states = [...new Set(facilities.map(f => f.state))];

    const byState = states.map(state => {
      const stateFacilities = facilities.filter(f => f.state === state);
      return {
        state,
        zone: stateFacilities[0]?.geopolitical_zone || 'Unknown',
        facility_count: stateFacilities.length,
        critical_count: stateFacilities.filter(f => f.risk_tier === 'CRITICAL').length,
        silent_count: stateFacilities.filter(f => f.is_silent).length,
        rural_ratio: parseFloat((stateFacilities.filter(f => f.is_rural).length / stateFacilities.length).toFixed(2)),
        cold_chain_ratio: parseFloat((stateFacilities.filter(f => f.has_cold_chain).length / stateFacilities.length).toFixed(2)),
      };
    });

    res.json({
      total_facilities: totalFacilities,
      states_count: states.length,
      critical_risk_count: criticalCount,
      high_risk_count: highCount,
      silent_facilities_count: silentCount,
      rural_facilities_count: ruralFacilities,
      cold_chain_count: coldChainCount,
      by_state: byState,
      lga_count: Object.keys(lgas).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve overview stats', message: error.message });
  }
});

export default router;
