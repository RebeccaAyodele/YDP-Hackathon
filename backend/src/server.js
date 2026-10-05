import express from 'express';
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Load in-memory dataset from data_layer artifacts on startup
try {
  loadDataLayer();
} catch (err) {
  console.warn('Initial data load warning:', err.message);
}

// Routes
app.use('/api/facilities', facilityRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/simulation', simulationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'PHC Pulse API', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[API Error]:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PHC Pulse API running on http://localhost:${PORT}`);
  console.log(`📊 Data Layer Source: ${process.env.DATA_LAYER_PROCESSED_DIR || '../data_layer/data/processed'}`);
  console.log(`======================================================\n`);
});

export default app;
