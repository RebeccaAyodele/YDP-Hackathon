import express, { Request, Response } from 'express';
import { getScoredFacilities } from '../services/riskEngine.js';
import { 
  getLgaIndicators, 
  getFacilityFeatures, 
  getFacilityInventoryMap, 
  getCommodities 
} from '../services/dataLoader.js';

const router = express.Router();

router.get('/stats', (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    let facilities = getScoredFacilities();
    if (state && typeof state === 'string') {
      facilities = facilities.filter(f => f.state.toLowerCase() === state.toLowerCase());
    }

    const lgas = getLgaIndicators();

    const totalFacilities = facilities.length;
    const ruralFacilities = facilities.filter(f => f.is_rural).length;
    const coldChainCount = facilities.filter(f => f.has_cold_chain).length;
    const criticalCount = facilities.filter(f => f.risk_tier === 'CRITICAL').length;
    const highCount = facilities.filter(f => f.risk_tier === 'HIGH').length;
    const mediumCount = facilities.filter(f => f.risk_tier === 'MEDIUM').length;
    const lowCount = facilities.filter(f => f.risk_tier === 'LOW').length;
    const silentCount = facilities.filter(f => f.is_silent).length;

    const states = [...new Set(facilities.map(f => f.state))];

    const byState = states.map(st => {
      const stateFacilities = facilities.filter(f => f.state === st);
      return {
        state: st,
        zone: stateFacilities[0]?.geopolitical_zone || 'Unknown',
        facility_count: stateFacilities.length,
        critical_count: stateFacilities.filter(f => f.risk_tier === 'CRITICAL').length,
        silent_count: stateFacilities.filter(f => f.is_silent).length,
        rural_ratio: parseFloat((stateFacilities.filter(f => f.is_rural).length / (stateFacilities.length || 1)).toFixed(2)),
        cold_chain_ratio: parseFloat((stateFacilities.filter(f => f.has_cold_chain).length / (stateFacilities.length || 1)).toFixed(2)),
      };
    });

    res.json({
      total_facilities: totalFacilities,
      states_count: states.length,
      critical_risk_count: criticalCount,
      high_risk_count: highCount,
      medium_risk_count: mediumCount,
      low_risk_count: lowCount,
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

router.get('/analytics', (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    let scoredFacilities = getScoredFacilities();
    let features = getFacilityFeatures();
    const inventoryMap = getFacilityInventoryMap();
    const commoditiesCatalog = getCommodities();

    if (state && typeof state === 'string') {
      const stateLower = state.toLowerCase();
      scoredFacilities = scoredFacilities.filter(f => f.state.toLowerCase() === stateLower);
      features = features.filter(f => f.state.toLowerCase() === stateLower);
    }

    const totalFacCount = scoredFacilities.length || 1;

    // 1. Commodity Stockout Statistics across active facilities
    const commodityStatsMap: Record<string, {
      commodity_id: string;
      name: string;
      category: string;
      stockout_count: number;
      total_tested: number;
      total_days_stocked_out: number;
      total_unmet_demand: number;
      cold_chain_breach_count: number;
    }> = {};

    // Initialize map from catalog
    for (const comm of commoditiesCatalog) {
      commodityStatsMap[comm.commodity_id] = {
        commodity_id: comm.commodity_id,
        name: comm.name,
        category: comm.category,
        stockout_count: 0,
        total_tested: 0,
        total_days_stocked_out: 0,
        total_unmet_demand: 0,
        cold_chain_breach_count: 0,
      };
    }

    // Tally from inventoryMap for the filtered facilities
    for (const fac of scoredFacilities) {
      const items = inventoryMap.get(fac.facility_id);
      if (items && items.length > 0) {
        for (const it of items) {
          if (!commodityStatsMap[it.commodity_id]) {
            commodityStatsMap[it.commodity_id] = {
              commodity_id: it.commodity_id,
              name: it.name,
              category: 'Essential Medicines',
              stockout_count: 0,
              total_tested: 0,
              total_days_stocked_out: 0,
              total_unmet_demand: 0,
              cold_chain_breach_count: 0,
            };
          }
          const cStat = commodityStatsMap[it.commodity_id];
          cStat.total_tested += 1;
          if (it.is_stockout || it.ending_stock <= 0) {
            cStat.stockout_count += 1;
          }
          cStat.total_days_stocked_out += (it.days_stocked_out || 0);
          cStat.total_unmet_demand += (it.unmet_demand || 0);
          if (it.cold_chain_breach) {
            cStat.cold_chain_breach_count += 1;
          }
        }
      }
    }

    const commodityStockouts = Object.values(commodityStatsMap)
      .map(c => ({
        commodity_id: c.commodity_id,
        name: c.name,
        category: c.category,
        stockout_facilities: c.stockout_count,
        total_facilities: c.total_tested || totalFacCount,
        stockout_rate_pct: Math.round(((c.stockout_count) / (c.total_tested || totalFacCount)) * 100),
        avg_days_stocked_out: c.total_tested ? Math.round((c.total_days_stocked_out / c.total_tested) * 10) / 10 : 0,
        total_unmet_demand: Math.round(c.total_unmet_demand),
        cold_chain_breaches: c.cold_chain_breach_count,
      }))
      .sort((a, b) => b.stockout_rate_pct - a.stockout_rate_pct);

    // 2. LGA Vulnerability & Ground Truth Aggregations
    const lgaMap: Record<string, {
      lga_name: string;
      state: string;
      zone: string;
      count: number;
      total_risk: number;
      stockout_facilities: number;
      poverty_mpi: number;
      immunization_rate: number;
      under5_mortality: number;
    }> = {};

    for (const feat of features) {
      const key = `${feat.lga_name}_${feat.state}`;
      if (!lgaMap[key]) {
        lgaMap[key] = {
          lga_name: feat.lga_name,
          state: feat.state,
          zone: feat.geopolitical_zone || 'Unknown',
          count: 0,
          total_risk: 0,
          stockout_facilities: 0,
          poverty_mpi: feat.lga_poverty_mpi || 0,
          immunization_rate: feat.lga_full_immunization_rate || 0,
          under5_mortality: feat.lga_under5_mortality_per_1k || 0,
        };
      }
      lgaMap[key].count += 1;
      lgaMap[key].total_risk += feat.ground_truth_risk_score || 0;
      if (feat.ground_truth_stockout_any === 1) {
        lgaMap[key].stockout_facilities += 1;
      }
    }

    const lgaVulnerability = Object.values(lgaMap)
      .map(item => ({
        lga_name: item.lga_name,
        state: item.state,
        zone: item.zone,
        facility_count: item.count,
        avg_risk_score: Math.round(item.total_risk / (item.count || 1)),
        stockout_rate_pct: Math.round((item.stockout_facilities / (item.count || 1)) * 100),
        poverty_mpi_pct: Math.round(item.poverty_mpi * 100),
        immunization_rate_pct: Math.round(item.immunization_rate * 100),
        under5_mortality: Math.round(item.under5_mortality),
      }))
      .sort((a, b) => b.avg_risk_score - a.avg_risk_score);

    // 3. Reporting Latency / Silence Distribution
    let w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4plus = 0;
    for (const feat of features) {
      const w = feat.weeks_since_last_report || 0;
      if (w === 0) w0++;
      else if (w === 1) w1++;
      else if (w === 2) w2++;
      else if (w === 3) w3++;
      else w4plus++;
    }

    const reportingLatencyDistribution = [
      { bucket: '0 Wks (Active)', count: w0, percentage: Math.round((w0 / totalFacCount) * 100) },
      { bucket: '1 Wk Delayed', count: w1, percentage: Math.round((w1 / totalFacCount) * 100) },
      { bucket: '2 Wks Delayed', count: w2, percentage: Math.round((w2 / totalFacCount) * 100) },
      { bucket: '3 Wks (Silent)', count: w3, percentage: Math.round((w3 / totalFacCount) * 100) },
      { bucket: '4+ Wks (Severe)', count: w4plus, percentage: Math.round((w4plus / totalFacCount) * 100) },
    ];

    // 4. Facility Infrastructure & Staffing by Type
    const typeMap: Record<string, {
      totalStaff: number;
      totalNurses: number;
      totalChew: number;
      coldChain: number;
      solar: number;
      borehole: number;
      count: number;
    }> = {};

    for (const feat of features) {
      const type = feat.facility_type || 'Primary Health Centre';
      if (!typeMap[type]) {
        typeMap[type] = { totalStaff: 0, totalNurses: 0, totalChew: 0, coldChain: 0, solar: 0, borehole: 0, count: 0 };
      }
      typeMap[type].totalStaff += (feat.total_staff || 0);
      typeMap[type].totalNurses += (feat.nurses_midwives_count || 0);
      typeMap[type].totalChew += (feat.chew_count || 0);
      if (feat.has_cold_chain === 1) typeMap[type].coldChain += 1;
      if (feat.has_solar_power === 1) typeMap[type].solar += 1;
      if (feat.has_borehole_water === 1) typeMap[type].borehole += 1;
      typeMap[type].count += 1;
    }

    const facilityTypeBreakdown = Object.entries(typeMap).map(([type, d]) => ({
      facility_type: type.replace('Comprehensive Health Centre', 'CHC').replace('Primary Health Centre', 'PHC').replace('Primary Health Clinic', 'Clinic'),
      full_type: type,
      count: d.count,
      avg_staff: Math.round((d.totalStaff / (d.count || 1)) * 10) / 10,
      avg_nurses: Math.round((d.totalNurses / (d.count || 1)) * 10) / 10,
      avg_chews: Math.round((d.totalChew / (d.count || 1)) * 10) / 10,
      cold_chain_pct: Math.round((d.coldChain / (d.count || 1)) * 100),
      solar_pct: Math.round((d.solar / (d.count || 1)) * 100),
      water_pct: Math.round((d.borehole / (d.count || 1)) * 100),
    }));

    // 5. State / Zone Comparisons
    const stateMap: Record<string, {
      state: string;
      zone: string;
      count: number;
      total_risk: number;
      critical_count: number;
      silent_count: number;
      cold_chain_count: number;
      total_staff: number;
    }> = {};

    for (const fac of scoredFacilities) {
      if (!stateMap[fac.state]) {
        stateMap[fac.state] = {
          state: fac.state,
          zone: fac.geopolitical_zone || 'Unknown',
          count: 0,
          total_risk: 0,
          critical_count: 0,
          silent_count: 0,
          cold_chain_count: 0,
          total_staff: 0,
        };
      }
      stateMap[fac.state].count += 1;
      stateMap[fac.state].total_risk += fac.base_risk_score || 0;
      if (fac.risk_tier === 'CRITICAL') stateMap[fac.state].critical_count += 1;
      if (fac.is_silent) stateMap[fac.state].silent_count += 1;
      if (fac.has_cold_chain) stateMap[fac.state].cold_chain_count += 1;
      stateMap[fac.state].total_staff += (fac.total_staff || 0);
    }

    const stateComparison = Object.values(stateMap).map(s => ({
      state: s.state,
      zone: s.zone,
      facility_count: s.count,
      avg_risk: Math.round(s.total_risk / (s.count || 1)),
      critical_count: s.critical_count,
      silent_count: s.silent_count,
      cold_chain_pct: Math.round((s.cold_chain_count / (s.count || 1)) * 100),
      avg_staff: Math.round((s.total_staff / (s.count || 1)) * 10) / 10,
    })).sort((a, b) => b.avg_risk - a.avg_risk);

    res.json({
      total_facilities: scoredFacilities.length,
      scope: state || 'National (All States)',
      commodity_stockouts: commodityStockouts,
      lga_vulnerability: lgaVulnerability,
      reporting_latency_distribution: reportingLatencyDistribution,
      facility_type_breakdown: facilityTypeBreakdown,
      state_comparison: stateComparison,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compute dataset analytics', message: error.message });
  }
});

export default router;
