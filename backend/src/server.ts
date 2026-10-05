import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import facilityRoutes from './routes/facilityRoutes.js';
import overviewRoutes from './routes/overviewRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import { loadDataLayer } from './services/dataLoader.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

try {
  loadDataLayer();
} catch (err: any) {
  console.warn('Initial data load warning:', err.message);
}

app.use('/api/facilities', facilityRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/simulation', simulationRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'PHC Pulse TypeScript API', timestamp: new Date().toISOString() });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PHC Pulse API running on http://localhost:${PORT}`);
  console.log(`📊 Data Layer Source: ${process.env.DATA_LAYER_PROCESSED_DIR || '../data_layer/data/processed'}\n`);
});

export default app;
