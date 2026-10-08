import {
  getFacilities,
  getFacilityFeaturesMap,
  getFacilityInventoryMap,
  getCommodities,
  getLgaIndicators
} from './dataLoader.js';
import {
  FacilityRecord,
  LGAContext,
  ScoredFacility,
  RiskTier,
  RiskFactor,
  CommodityStatus,
  FacilityFeatures,
  FacilityInventoryItem
} from '../types/index.js';
import { computeAdjustedCascadingScores } from './cascadingEngine.js';

export function generateFacilityCommodityStatus(
  facility: FacilityRecord,
  features?: FacilityFeatures,
  inventoryItems?: FacilityInventoryItem[]
): CommodityStatus[] {
  const catalog = getCommodities();

  if (inventoryItems && inventoryItems.length > 0) {
    const invMap = new Map(inventoryItems.map(item => [item.commodity_id, item]));

    return catalog.map(c => {
      const item = invMap.get(c.commodity_id);
      if (item) {
        let status: 'ADEQUATE' | 'LOW' | 'STOCKOUT' = 'ADEQUATE';
        let daysRemaining = 14;

        if (item.is_stockout || item.ending_stock <= 0) {
          status = 'STOCKOUT';
          daysRemaining = 0;
        } else {
          const dailyConsumption = Math.max(0.1, item.actual_consumption / 7);
          daysRemaining = Math.max(1, Math.round(item.ending_stock / dailyConsumption));
          if (daysRemaining <= 7) {
            status = 'LOW';
          }
        }

        return {
          commodity_id: c.commodity_id,
          name: c.name,
          category: c.category,
          unit: c.unit,
          status,
          estimated_days_remaining: daysRemaining,
          is_cold_chain_required: Boolean(c.requires_cold_chain),
        };
      }

      // Fallback if commodity not in inventory item map
      const hasColdChain = features ? features.has_cold_chain === 1 : facility.has_cold_chain;
      const isStockout = c.requires_cold_chain && !hasColdChain;
      return {
        commodity_id: c.commodity_id,
        name: c.name,
        category: c.category,
        unit: c.unit,
        status: isStockout ? 'STOCKOUT' : 'ADEQUATE',
        estimated_days_remaining: isStockout ? 0 : 14,
        is_cold_chain_required: Boolean(c.requires_cold_chain),
      };
    });
  }

  // Fallback if inventoryItems not available
  const transportDiff = features?.transport_access_difficulty ?? facility.transport_access_difficulty ?? 0.5;
  const isSilent = features ? features.is_silent_decaying : (facility.baseline_reporting_prob ?? 0.5) < 0.35;
  const hasCold = features ? features.has_cold_chain === 1 : facility.has_cold_chain;

  return catalog.map(c => {
    let status: 'ADEQUATE' | 'LOW' | 'STOCKOUT' = 'ADEQUATE';
    let daysRemaining = Math.round(20 - transportDiff * 14);

    if (c.requires_cold_chain && !hasCold) {
      status = 'STOCKOUT';
      daysRemaining = 0;
    } else if (isSilent && transportDiff > 0.6) {
      status = 'STOCKOUT';
      daysRemaining = 0;
    } else if (transportDiff > 0.65) {
      status = 'LOW';
      daysRemaining = 5;
    }

    return {
      commodity_id: c.commodity_id,
      name: c.name,
      category: c.category,
      unit: c.unit,
      status,
      estimated_days_remaining: Math.max(0, daysRemaining),
      is_cold_chain_required: Boolean(c.requires_cold_chain),
    };
  });
}

export function calculateFacilityRisk(
  facility: FacilityRecord,
  features?: FacilityFeatures,
  inventoryItems?: FacilityInventoryItem[],
  lgaContext?: LGAContext | null
): ScoredFacility {
  const reasons: string[] = [];
  const riskFactors: RiskFactor[] = [];

  // 1. Base Risk Score from Data Layer Model
  let modelScore = 0;
  if (features && features.ground_truth_risk_score !== undefined) {
    modelScore = features.ground_truth_risk_score;
  } else {
    // Graceful fallback if features not yet loaded
    const repProb = facility.baseline_reporting_prob ?? 0.5;
    modelScore = Math.round((1 - repProb) * 40 + (facility.is_rural ? 20 : 5));
  }

  // 2. Derive Structured Risk Factors and Explainable Reasons from Model Features
  const isSilent = features ? features.is_silent_decaying : (facility.baseline_reporting_prob ?? 0.5) < 0.35;
  const weeksSilent = features?.weeks_since_last_report ?? (isSilent ? 4 : 0);
  const stockoutCount = features?.ground_truth_stockout_count ?? 0;
  const criticalStockout = features ? Boolean(features.ground_truth_critical_stockout) : false;
  const hasCold = features ? features.has_cold_chain === 1 : facility.has_cold_chain;
  const totalStaff = features?.total_staff ?? facility.total_staff ?? 0;
  const nursesMidwives = features?.nurses_midwives_count ?? facility.nurses_midwives_count ?? 0;
  const transportDiff = features?.transport_access_difficulty ?? facility.transport_access_difficulty ?? 0.5;
  const gsmConn = features?.gsm_connectivity_score ?? facility.gsm_connectivity_score ?? 0.5;
  const mpi = features?.lga_poverty_mpi ?? lgaContext?.poverty_mpi_2022 ?? 0.25;

  if (isSilent || weeksSilent >= 3) {
    const pts = Math.min(30, weeksSilent * 8);
    reasons.push(`Information Blackout: ${weeksSilent} consecutive weeks without submitted reports`);
    riskFactors.push({ factor: 'Reporting Decay', severity: 'CRITICAL', points: pts });
  } else if (features && features.reporting_completeness_4w < 0.5) {
    reasons.push(`Irregular reporting pattern: ${Math.round(features.reporting_completeness_4w * 100)}% 4-week completeness`);
    riskFactors.push({ factor: 'Reporting Friction', severity: 'MEDIUM', points: 12 });
  }

  if (criticalStockout) {
    reasons.push('Critical stockout event: Life-saving antimalarials, oxytocin, or vaccines exhausted');
    riskFactors.push({ factor: 'Critical Stockout', severity: 'CRITICAL', points: 25 });
  } else if (stockoutCount > 0) {
    reasons.push(`Active stockout: ${stockoutCount} monitored essential commodities exhausted`);
    riskFactors.push({ factor: 'Stockout Depletion', severity: 'HIGH', points: Math.min(20, stockoutCount * 5) });
  }

  if (!hasCold) {
    reasons.push('No active cold-chain refrigeration: zero vaccine/oxytocin preservation');
    riskFactors.push({ factor: 'Cold Chain Absence', severity: 'HIGH', points: 20 });
  } else if (features && features.has_solar_power === 0) {
    reasons.push('Cold chain present but lacks dedicated solar power backup');
    riskFactors.push({ factor: 'Cold Chain Power', severity: 'LOW', points: 8 });
  }

  if (totalStaff <= 2) {
    reasons.push(`Severe clinical staffing deficit: only ${totalStaff} health worker(s) on duty`);
    riskFactors.push({ factor: 'Staffing Deficit', severity: 'CRITICAL', points: 18 });
  } else if (nursesMidwives === 0) {
    reasons.push('Zero qualified nurse/midwife staff for maternal & obstetric care');
    riskFactors.push({ factor: 'Maternal Readiness', severity: 'HIGH', points: 12 });
  }

  if (transportDiff > 0.6) {
    reasons.push('High geographic isolation: rough terrain impeding emergency resupply');
    riskFactors.push({ factor: 'Logistics Access', severity: 'HIGH', points: 12 });
  }

  if (gsmConn < 0.3) {
    reasons.push('Poor GSM network connectivity (telecom blind spot zone)');
    riskFactors.push({ factor: 'Connectivity', severity: 'MEDIUM', points: 10 });
  }

  if (mpi >= 0.50) {
    reasons.push(`High vulnerability catchment: LGA Multidimensional Poverty Index ${mpi.toFixed(2)}`);
    riskFactors.push({ factor: 'Poverty Burden', severity: 'HIGH', points: 15 });
  }

  // 3. Classify Risk Tier directly from model score
  const normalizedScore = Math.min(100, Math.max(0, Math.round(modelScore * 10) / 10));

  let riskTier: RiskTier = 'LOW';
  if (normalizedScore >= 70) riskTier = 'CRITICAL';
  else if (normalizedScore >= 45) riskTier = 'HIGH';
  else if (normalizedScore >= 25) riskTier = 'MEDIUM';

  const topReasonSummary = reasons.slice(0, 3).join(' • ') || 'Operating within standard baseline parameters';
  const commodities = generateFacilityCommodityStatus(facility, features, inventoryItems);

  return {
    ...facility,
    base_risk_score: normalizedScore,
    risk_tier: riskTier,
    is_silent: isSilent,
    weeks_since_last_report: weeksSilent,
    reporting_completeness_4w: features?.reporting_completeness_4w,
    estimated_effective_stock_weeks: features?.estimated_effective_stock_weeks,
    ground_truth_stockout_count: stockoutCount,
    ground_truth_critical_stockout: criticalStockout,
    top_reason_summary: topReasonSummary,
    detailed_reasons: reasons,
    risk_factors: riskFactors,
    commodities,
    features,
  };
}

let scoredFacilitiesCache: ScoredFacility[] | null = null;

export function getScoredFacilities(): ScoredFacility[] {
  if (scoredFacilitiesCache) return scoredFacilitiesCache;

  const facilities = getFacilities();
  const featuresMap = getFacilityFeaturesMap();
  const inventoryMap = getFacilityInventoryMap();
  const lgaMap = getLgaIndicators();

  const baseScored = facilities.map(fac => {
    const feat = featuresMap.get(fac.facility_id);
    const inv = inventoryMap.get(fac.facility_id);
    const lgaInfo = lgaMap[fac.lga_id] || null;
    return calculateFacilityRisk(fac, feat, inv, lgaInfo);
  });

  scoredFacilitiesCache = computeAdjustedCascadingScores(baseScored);
  return scoredFacilitiesCache;
}

