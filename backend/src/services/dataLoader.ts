import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FacilityRecord, GraphEdge, LGAContext, FacilityFeatures, FacilityInventoryItem } from '../types/index.js';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let facilitiesCache: FacilityRecord[] = [];
let edgesCache: GraphEdge[] = [];
let rawCommoditiesCache: any[] = [];
let rawLgaIndicatorsCache: Record<string, LGAContext> = {};
let featuresCache: FacilityFeatures[] = [];
let featuresMapCache: Map<string, FacilityFeatures> = new Map();
let inventoryMapCache: Map<string, FacilityInventoryItem[]> = new Map();
let isInitializedFromDb = false;

export async function loadFromSupabase(): Promise<boolean> {
  if (!supabase) {
    console.log('[DataLoader] Supabase client not configured. Skipping database fetch.');
    return false;
  }

  try {
    console.log('[DataLoader] Fetching datasets from Supabase database...');

    // 1. Fetch Facilities
    const { data: facData, error: facErr } = await supabase
      .from('facilities')
      .select('*')
      .limit(10000);

    if (facErr || !facData || facData.length === 0) {
      console.warn('[DataLoader] Could not fetch facilities from Supabase:', facErr?.message);
      return false;
    }
    facilitiesCache = facData as FacilityRecord[];
    console.log(`[DataLoader:DB] Loaded ${facilitiesCache.length} facilities from Supabase`);

    // 2. Fetch Features
    const { data: featData, error: featErr } = await supabase
      .from('facility_features')
      .select('*')
      .limit(10000);

    if (featData && featData.length > 0) {
      featuresCache = featData as FacilityFeatures[];
      featuresMapCache = new Map(featuresCache.map(f => [f.facility_id, f]));
      console.log(`[DataLoader:DB] Loaded ${featuresCache.length} model feature records from Supabase`);
    }

    // 3. Fetch Graph Edges
    const { data: edgeData } = await supabase
      .from('facility_graph_edges')
      .select('*')
      .limit(20000);

    if (edgeData && edgeData.length > 0) {
      edgesCache = edgeData as GraphEdge[];
      console.log(`[DataLoader:DB] Loaded ${edgesCache.length} graph edges from Supabase`);
    }

    // 4. Fetch Commodities
    const { data: commData } = await supabase
      .from('essential_commodities')
      .select('*')
      .limit(1000);

    if (commData && commData.length > 0) {
      rawCommoditiesCache = commData;
    }

    // 5. Fetch LGA Indicators
    const { data: lgaData } = await supabase
      .from('nigeria_lga_indicators')
      .select('*')
      .limit(1000);

    if (lgaData && lgaData.length > 0) {
      rawLgaIndicatorsCache = {};
      for (const lga of lgaData) {
        rawLgaIndicatorsCache[lga.lga_id] = lga as LGAContext;
      }
    }

    // 6. Fetch Week 52 Stock Reports for Latest Inventory Snapshot
    const { data: week52Reports } = await supabase
      .from('weekly_stock_reports')
      .select('*')
      .eq('week_number', 52)
      .limit(50000);

    if (week52Reports && week52Reports.length > 0) {
      inventoryMapCache = new Map();
      for (const row of week52Reports) {
        const item: FacilityInventoryItem = {
          commodity_id: row.commodity_id,
          name: row.commodity_name,
          requires_cold_chain: Boolean(row.requires_cold_chain),
          ending_stock: Number(row.ending_stock) || 0,
          actual_consumption: Number(row.actual_consumption) || 0,
          is_stockout: Boolean(row.is_stockout),
          days_stocked_out: Number(row.days_stocked_out) || 0,
          unmet_demand: Number(row.unmet_demand) || 0,
          cold_chain_breach: Boolean(row.cold_chain_breach),
        };
        const currentList = inventoryMapCache.get(row.facility_id) || [];
        currentList.push(item);
        inventoryMapCache.set(row.facility_id, currentList);
      }
      console.log(`[DataLoader:DB] Loaded Week 52 inventory snapshot for ${inventoryMapCache.size} facilities from Supabase`);
    }

    isInitializedFromDb = true;
    return true;
  } catch (error: any) {
    console.error('[DataLoader] Error loading data from Supabase:', error.message);
    return false;
  }
}

export function loadDataLayer() {
  if (isInitializedFromDb && facilitiesCache.length > 0) {
    return {
      facilities: facilitiesCache,
      edges: edgesCache,
      features: featuresCache,
      commodities: rawCommoditiesCache,
      lgas: rawLgaIndicatorsCache,
    };
  }

  const processedDir = path.resolve(__dirname, '../../../data_layer/data/processed');
  const rawDir = path.resolve(__dirname, '../../../data_layer/data/raw');

  try {
    const facilitiesPath = path.join(processedDir, 'facilities.json');
    if (fs.existsSync(facilitiesPath)) {
      const data = fs.readFileSync(facilitiesPath, 'utf8');
      facilitiesCache = JSON.parse(data) as FacilityRecord[];
      console.log(`[DataLoader:Local] Loaded ${facilitiesCache.length} facilities from ${facilitiesPath}`);
    }

    const edgesPath = path.join(processedDir, 'facility_graph_edges.json');
    if (fs.existsSync(edgesPath)) {
      const data = fs.readFileSync(edgesPath, 'utf8');
      edgesCache = JSON.parse(data) as GraphEdge[];
      console.log(`[DataLoader:Local] Loaded ${edgesCache.length} graph edges from ${edgesPath}`);
    }

    const featuresPath = path.join(processedDir, 'facility_features.json');
    if (fs.existsSync(featuresPath)) {
      const data = fs.readFileSync(featuresPath, 'utf8');
      featuresCache = JSON.parse(data) as FacilityFeatures[];
      featuresMapCache = new Map(featuresCache.map(f => [f.facility_id, f]));
      console.log(`[DataLoader:Local] Loaded ${featuresCache.length} model feature records from ${featuresPath}`);
    }

    const inventoryPath = path.join(processedDir, 'facility_latest_inventory.json');
    if (fs.existsSync(inventoryPath)) {
      const data = fs.readFileSync(inventoryPath, 'utf8');
      const invObj = JSON.parse(data) as Record<string, FacilityInventoryItem[]>;
      inventoryMapCache = new Map(Object.entries(invObj));
      console.log(`[DataLoader:Local] Loaded Week 52 inventory records for ${inventoryMapCache.size} facilities from ${inventoryPath}`);
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
  } catch (error: any) {
    console.error('[DataLoader:Local] Error loading local data layer files:', error.message);
  }

  return {
    facilities: facilitiesCache,
    edges: edgesCache,
    features: featuresCache,
    commodities: rawCommoditiesCache,
    lgas: rawLgaIndicatorsCache,
  };
}

export async function initDataLoader() {
  const loadedFromDb = await loadFromSupabase();
  if (!loadedFromDb) {
    console.log('[DataLoader] Falling back to local processed dataset files...');
    loadDataLayer();
  }

  const sourceName = isInitializedFromDb ? '🟢 SUPABASE POSTGRES DATABASE' : '📁 LOCAL JSON/PARQUET FALLBACK';
  console.log('\n' + '='.repeat(60));
  console.log('  🏥 PHC PULSE DATA INITIALIZATION REPORT');
  console.log(`  Source: ${sourceName}`);
  console.log(`  • Facilities Loaded:         ${facilitiesCache.length.toLocaleString()}`);
  console.log(`  • Risk Feature Records:      ${featuresCache.length.toLocaleString()}`);
  console.log(`  • Spatial Graph Edges:       ${edgesCache.length.toLocaleString()}`);
  console.log(`  • Inventory Snapshot Count:  ${inventoryMapCache.size.toLocaleString()}`);
  console.log('='.repeat(60) + '\n');
}

export function getDataLoaderStatus() {
  return {
    source: isInitializedFromDb ? 'SUPABASE_DATABASE' : 'LOCAL_STORAGE_FALLBACK',
    is_connected_to_db: isInitializedFromDb,
    facilities_count: facilitiesCache.length,
    features_count: featuresCache.length,
    edges_count: edgesCache.length,
    inventory_snapshot_count: inventoryMapCache.size,
  };
}

export function getFacilities(): FacilityRecord[] {
  if (facilitiesCache.length === 0) {
    loadDataLayer();
  }
  return facilitiesCache;
}

export function getFacilityGraphEdges(): GraphEdge[] {
  if (edgesCache.length === 0) {
    loadDataLayer();
  }
  return edgesCache;
}

export function getFacilityFeatures(): FacilityFeatures[] {
  if (featuresCache.length === 0) {
    loadDataLayer();
  }
  return featuresCache;
}

export function getFacilityFeaturesMap(): Map<string, FacilityFeatures> {
  if (featuresMapCache.size === 0) {
    loadDataLayer();
  }
  return featuresMapCache;
}

export function getFacilityInventoryMap(): Map<string, FacilityInventoryItem[]> {
  if (inventoryMapCache.size === 0) {
    loadDataLayer();
  }
  return inventoryMapCache;
}

export function getCommodities(): any[] {
  if (rawCommoditiesCache.length === 0) {
    loadDataLayer();
  }
  return rawCommoditiesCache;
}

export function getLgaIndicators(): Record<string, LGAContext> {
  if (Object.keys(rawLgaIndicatorsCache).length === 0) {
    loadDataLayer();
  }
  return rawLgaIndicatorsCache;
}


