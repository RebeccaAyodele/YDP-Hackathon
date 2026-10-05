import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let facilitiesCache = [];
let edgesCache = [];
let rawCommoditiesCache = [];
let rawLgaIndicatorsCache = {};

export function loadDataLayer() {
  const processedDir = path.resolve(__dirname, '../../../data_layer/data/processed');
  const rawDir = path.resolve(__dirname, '../../../data_layer/data/raw');

  try {
    const facilitiesPath = path.join(processedDir, 'facilities.json');
    if (fs.existsSync(facilitiesPath)) {
      const data = fs.readFileSync(facilitiesPath, 'utf8');
      facilitiesCache = JSON.parse(data);
      console.log(`[DataLoader] Loaded ${facilitiesCache.length} facilities from ${facilitiesPath}`);
    }

    const edgesPath = path.join(processedDir, 'facility_graph_edges.json');
    if (fs.existsSync(edgesPath)) {
      const data = fs.readFileSync(edgesPath, 'utf8');
      edgesCache = JSON.parse(data);
      console.log(`[DataLoader] Loaded ${edgesCache.length} graph edges from ${edgesPath}`);
    }

    const commoditiesPath = path.join(rawDir, 'essential_commodities.json');
    if (fs.existsSync(commoditiesPath)) {
      const data = fs.readFileSync(commoditiesPath, 'utf8');
      rawCommoditiesCache = JSON.parse(data);
    }

    const lgaPath = path.join(rawDir, 'nigeria_lga_indicators.json');
    if (fs.existsSync(lgaPath)) {
      const data = fs.readFileSync(lgaPath, 'utf8');
      rawLgaIndicatorsCache = JSON.parse(data);
    }
  } catch (error) {
    console.error('[DataLoader] Error loading data layer files:', error.message);
  }

  return {
    facilities: facilitiesCache,
    edges: edgesCache,
    commodities: rawCommoditiesCache,
    lgas: rawLgaIndicatorsCache,
  };
}

export function getFacilities() {
  if (facilitiesCache.length === 0) {
    loadDataLayer();
  }
  return facilitiesCache;
}

export function getFacilityGraphEdges() {
  if (edgesCache.length === 0) {
    loadDataLayer();
  }
  return edgesCache;
}

export function getCommodities() {
  return rawCommoditiesCache;
}

export function getLgaIndicators() {
  return rawLgaIndicatorsCache;
}
