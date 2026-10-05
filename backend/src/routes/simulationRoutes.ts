import express, { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { simulateMultiHopCascade } from '../services/cascadingEngine.js';

const router = express.Router();

router.post('/cascading', (req: Request, res: Response) => {
  try {
    const { facility_id, shock_magnitude = 35 } = req.body;
    const facilities = getScoredFacilities();

    const cascadeResult = simulateMultiHopCascade(facility_id, Number(shock_magnitude), facilities);

    if (!cascadeResult) {
      return res.status(404).json({ error: 'Target facility not found', facility_id });
    }

    res.json(cascadeResult);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to run cascading simulation', message: error.message });
  }
});

export default router;
