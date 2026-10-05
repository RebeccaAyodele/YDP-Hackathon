import express from 'express';
import { getFacilitiesList, getFacilityDetails } from '../controllers/facilityController.js';

const router = express.Router();

router.get('/', getFacilitiesList);
router.get('/:id', getFacilityDetails);

export default router;
