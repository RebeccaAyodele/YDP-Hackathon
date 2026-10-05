import { getFacilityGraphEdges } from './dataLoader.js';
import { ScoredFacility } from '../types/index.js';

export interface MultiHopCascadeResult {
  simulated_source: {
    facility_id: string;
    facility_name: string;
    applied_shock: number;
  };
  direct_hop1_neighbors: Array<{
    facility_id: string;
    facility_name: string;
    distance_km: number;
    overflow_weight: number;
    original_risk: number;
    added_risk: number;
    new_risk: number;
    jumped_to_critical: boolean;
  }>;
  secondary_hop2_neighbors: Array<{
    facility_id: string;
    facility_name: string;
    originating_hop1_id: string;
    distance_km: number;
    overflow_weight: number;
    original_risk: number;
    added_risk: number;
    new_risk: number;
    jumped_to_critical: boolean;
  }>;
  total_facilities_destabilized: number;
}

export function computeAdjustedCascadingScores(facilities: ScoredFacility[]): ScoredFacility[] {
  const edges = getFacilityGraphEdges();
  const facMap = new Map<string, ScoredFacility>(facilities.map(f => [f.facility_id, f]));

  const incomingStressMap = new Map<string, number>();

  for (const edge of edges) {
    const sourceFac = facMap.get(edge.source_facility_id);
    if (!sourceFac) continue;

    const sourceStress = sourceFac.base_risk_score;
    const transferredStress = sourceStress * edge.overflow_weight * 0.35;

    const currentStress = incomingStressMap.get(edge.target_facility_id) || 0;
    incomingStressMap.set(edge.target_facility_id, currentStress + transferredStress);
  }

  return facilities.map(fac => {
    const ambientStress = incomingStressMap.get(fac.facility_id) || 0;
    const adjusted = Math.min(100, Math.round(fac.base_risk_score + ambientStress));

    const isHiddenRisk = fac.base_risk_score < 50 && adjusted >= 65;

    return {
      ...fac,
      adjusted_cascading_score: adjusted,
      is_hidden_risk: isHiddenRisk,
    };
  });
}

export function simulateMultiHopCascade(
  sourceFacilityId: string,
  shockMagnitude: number = 35,
  facilities: ScoredFacility[]
): MultiHopCascadeResult | null {
  const edges = getFacilityGraphEdges();
  const facMap = new Map<string, ScoredFacility>(facilities.map(f => [f.facility_id, f]));

  const source = facMap.get(sourceFacilityId);
  if (!source) return null;

  const hop1Edges = edges.filter(e => e.source_facility_id === sourceFacilityId);
  const hop1Results: MultiHopCascadeResult['direct_hop1_neighbors'] = [];
  const hop1FacilityIds = new Set<string>();

  for (const edge of hop1Edges) {
    const neighbor = facMap.get(edge.target_facility_id);
    if (!neighbor) continue;

    const added = Math.round(shockMagnitude * edge.overflow_weight);
    const orig = neighbor.base_risk_score;
    const newRisk = Math.min(100, orig + added);

    hop1Results.push({
      facility_id: neighbor.facility_id,
      facility_name: neighbor.facility_name,
      distance_km: edge.distance_km,
      overflow_weight: edge.overflow_weight,
      original_risk: orig,
      added_risk: added,
      new_risk: newRisk,
      jumped_to_critical: newRisk >= 70 && orig < 70,
    });
    hop1FacilityIds.add(neighbor.facility_id);
  }

  const hop2Results: MultiHopCascadeResult['secondary_hop2_neighbors'] = [];
  const visitedHop2 = new Set<string>();

  for (const hop1 of hop1Results) {
    const hop2Edges = edges.filter(e => e.source_facility_id === hop1.facility_id);

    for (const edge of hop2Edges) {
      if (edge.target_facility_id === sourceFacilityId || hop1FacilityIds.has(edge.target_facility_id)) {
        continue;
      }
      if (visitedHop2.has(edge.target_facility_id)) continue;

      const secondaryNeighbor = facMap.get(edge.target_facility_id);
      if (!secondaryNeighbor) continue;

      const secondaryShock = hop1.added_risk * 0.55;
      const added2 = Math.max(1, Math.round(secondaryShock * edge.overflow_weight));
      const orig2 = secondaryNeighbor.base_risk_score;
      const newRisk2 = Math.min(100, orig2 + added2);

      hop2Results.push({
        facility_id: secondaryNeighbor.facility_id,
        facility_name: secondaryNeighbor.facility_name,
        originating_hop1_id: hop1.facility_id,
        distance_km: edge.distance_km,
        overflow_weight: edge.overflow_weight,
        original_risk: orig2,
        added_risk: added2,
        new_risk: newRisk2,
        jumped_to_critical: newRisk2 >= 70 && orig2 < 70,
      });
      visitedHop2.add(secondaryNeighbor.facility_id);
    }
  }

  const destabilizedCount = 
    hop1Results.filter(r => r.jumped_to_critical).length + 
    hop2Results.filter(r => r.jumped_to_critical).length;

  return {
    simulated_source: {
      facility_id: source.facility_id,
      facility_name: source.facility_name,
      applied_shock: shockMagnitude,
    },
    direct_hop1_neighbors: hop1Results,
    secondary_hop2_neighbors: hop2Results,
    total_facilities_destabilized: destabilizedCount,
  };
}
