import math
import json
from dataclasses import dataclass, asdict
from typing import List, Tuple
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from data_layer.facility_generator import FacilityRecord


@dataclass
class FacilityEdge:
    source_facility_id: str
    target_facility_id: str
    distance_km: float
    same_lga: bool
    same_state: bool
    overflow_weight: float  # Normalized absorption weight (sums to 1 across neighbors)
    target_capacity_score: float  # Relative capacity indicator of neighbor to absorb overflow


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float):
    "Calculates the great-circle distance between two points on the Earth's surface in kilometers"
    
    R = 6371.0  # Earth's mean radius in km

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


class FacilityNetworkBuilder:
    """Constructs k-nearest neighbor spatial adjacency graphs."""

    def __init__(self, facilities: List[FacilityRecord], k_neighbors: int = 3):
        self.facilities = facilities
        self.facilities_map = {f.facility_id: f for f in facilities}
        self.k = k_neighbors

    def build_network(self):
        """
        Builds directed edges from each facility to its k nearest neighbors.
        Weights decrease with distance: w_i = (1 / d_i) / sum(1 / d_j)
        """
        edges: List[FacilityEdge] = []

        for source in self.facilities:
            distances: List[Tuple[FacilityRecord, float]] = []
            for target in self.facilities:
                if target.facility_id == source.facility_id:
                    continue
                d = haversine_distance(source.latitude, source.longitude, target.latitude, target.longitude)
                distances.append((target, d))

            distances.sort(key=lambda x: x[1])
            k_nearest = distances[: self.k]

            inv_distances = [1.0 / (d + 0.5) for _, d in k_nearest]
            total_inv = sum(inv_distances)

            for idx, (target, dist) in enumerate(k_nearest):
                norm_weight = round(inv_distances[idx] / total_inv, 4)
                cap_score = round(target.total_staff / max(1.0, float(source.total_staff)), 2)

                edge = FacilityEdge(
                    source_facility_id=source.facility_id,
                    target_facility_id=target.facility_id,
                    distance_km=dist,
                    same_lga=(source.lga_id == target.lga_id),
                    same_state=(source.state == target.state),
                    overflow_weight=norm_weight,
                    target_capacity_score=cap_score
                )
                edges.append(edge)

        return edges

    def export_graph_json(self, output_path: Path):
        """Builds and writes facility graph edges to JSON."""
        edges = self.build_network()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        data = [asdict(e) for e in edges]
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Exported {len(edges)} facility graph edges to {output_path}")
        return edges
