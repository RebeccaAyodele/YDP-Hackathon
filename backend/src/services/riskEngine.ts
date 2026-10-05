import { getFacilities, getLgaIndicators, getCommodities } from './dataLoader.js';
import { FacilityRecord, LGAContext, ScoredFacility, RiskTier, RiskFactor, CommodityStatus } from '../types/index.js';
import { computeAdjustedCascadingScores } from './cascadingEngine.js';

export function generateFacilityCommodityStatus(facility: FacilityRecord): CommodityStatus[] {
  const catalog = getCommodities();
  const transportDiff = facility.transport_access_difficulty ?? 0.5;
  const isSilent = (facility.baseline_reporting_prob ?? 0.5) < 0.35;

  return catalog.map(c => {
    let status: 'ADEQUATE' | 'LOW' | 'STOCKOUT' = 'ADEQUATE';
    let daysRemaining = Math.round(20 - transportDiff * 14);

    if (c.requires_cold_chain && !facility.has_cold_chain) {
      status = 'STOCKOUT';
      daysRemaining = 0;
    } else if (isSilent && transportDiff > 0.6) {
      status = Math.random() > 0.4 ? 'STOCKOUT' : 'LOW';
      daysRemaining = status === 'STOCKOUT' ? 0 : Math.round(Math.random() * 4 + 1);
    } else if (transportDiff > 0.65) {
      status = 'LOW';
      daysRemaining = Math.round(Math.random() * 5 + 2);
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
  });
}

export function calculateFacilityRisk(facility: FacilityRecord, lgaContext: LGAContext | null = null): ScoredFacility {
  let score = 0;
  const reasons: string[] = [];
  const riskFactors: RiskFactor[] = [];

  const reportingProb = facility.baseline_reporting_prob ?? 0.5;
  const gsmConnectivity = facility.gsm_connectivity_score ?? 0.5;
  
  if (reportingProb < 0.35) {
    const silencePts = Math.round((0.35 - reportingProb) * 80);
    const pts = Math.min(silencePts, 25);
    score += pts;
    reasons.push('Chronic reporting decay: severe history of non-submission');
    riskFactors.push({ factor: 'Reporting Friction', severity: 'HIGH', points: pts });
  } else if (reportingProb < 0.55) {
    score += 12;
    reasons.push('Irregular reporting pattern: frequent late submissions');
    riskFactors.push({ factor: 'Reporting Friction', severity: 'MEDIUM', points: 12 });
  }

  if (gsmConnectivity < 0.3) {
    score += 10;
    reasons.push('Poor GSM network connectivity (blind spot zone)');
    riskFactors.push({ factor: 'Connectivity', severity: 'MEDIUM', points: 10 });
  }

  if (!facility.has_cold_chain) {
    score += 20;
    reasons.push('No active cold-chain refrigeration: zero vaccine storage capacity');
    riskFactors.push({ factor: 'Cold Chain', severity: 'HIGH', points: 20 });
  } else if (!facility.has_solar_power) {
    score += 8;
    reasons.push('Cold chain present but lacks dedicated solar power backup');
    riskFactors.push({ factor: 'Cold Chain Power', severity: 'LOW', points: 8 });
  }

  const totalStaff = facility.total_staff || 0;
  const nursesMidwives = facility.nurses_midwives_count || 0;
  const catchment = facility.catchment_population || 3000;
  const staffPerThousand = (totalStaff / Math.max(1, catchment)) * 1000;

  if (totalStaff <= 2) {
    score += 18;
    reasons.push(`Severe staffing deficit: only ${totalStaff} health worker(s) on duty`);
    riskFactors.push({ factor: 'Staffing', severity: 'CRITICAL', points: 18 });
  } else if (nursesMidwives === 0) {
    score += 12;
    reasons.push('Zero qualified nurse/midwife staff for maternal care');
    riskFactors.push({ factor: 'Maternal Readiness', severity: 'HIGH', points: 12 });
  } else if (staffPerThousand < 1.0) {
    score += 7;
    reasons.push('Understaffed relative to catchment population');
    riskFactors.push({ factor: 'Staffing Ratio', severity: 'LOW', points: 7 });
  }

  if (facility.is_rural) {
    const transportDifficulty = facility.transport_access_difficulty ?? 0.5;
    if (transportDifficulty > 0.6) {
      score += 12;
      reasons.push('High geographic isolation: difficult road transit for resupply');
      riskFactors.push({ factor: 'Logistics Access', severity: 'HIGH', points: 12 });
    } else {
      score += 6;
      reasons.push('Rural catchment location with logistics friction');
      riskFactors.push({ factor: 'Rurality', severity: 'LOW', points: 6 });
    }
  }

  if (lgaContext) {
    const mpi = lgaContext.poverty_mpi_2022 ?? 0.25;
    if (mpi >= 0.50) {
      score += 15;
      reasons.push(`Extreme multidimensional poverty LGA (MPI: ${mpi.toFixed(2)})`);
      riskFactors.push({ factor: 'Poverty Burden', severity: 'HIGH', points: 15 });
    } else if (mpi >= 0.35) {
      score += 8;
      reasons.push(`High poverty burden LGA (MPI: ${mpi.toFixed(2)})`);
      riskFactors.push({ factor: 'Poverty Burden', severity: 'MEDIUM', points: 8 });
    }
  }

  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)));

  let riskTier: RiskTier = 'LOW';
  if (normalizedScore >= 70) riskTier = 'CRITICAL';
  else if (normalizedScore >= 50) riskTier = 'HIGH';
  else if (normalizedScore >= 30) riskTier = 'MEDIUM';

  const topReasonSummary = reasons.slice(0, 3).join(' • ') || 'Operating within standard baseline parameters';
  const commodities = generateFacilityCommodityStatus(facility);

  return {
    ...facility,
    base_risk_score: normalizedScore,
    risk_tier: riskTier,
    is_silent: reportingProb < 0.35,
    top_reason_summary: topReasonSummary,
    detailed_reasons: reasons,
    risk_factors: riskFactors,
    commodities,
  };
}

let scoredFacilitiesCache: ScoredFacility[] | null = null;

export function getScoredFacilities(): ScoredFacility[] {
  if (scoredFacilitiesCache) return scoredFacilitiesCache;

  const facilities = getFacilities();
  const lgaMap = getLgaIndicators();

  const baseScored = facilities.map(fac => {
    const lgaInfo = lgaMap[fac.lga_id] || null;
    return calculateFacilityRisk(fac, lgaInfo);
  });

  scoredFacilitiesCache = computeAdjustedCascadingScores(baseScored);
  return scoredFacilitiesCache;
}
