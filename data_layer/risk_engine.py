from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

DATA_LAYER_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = DATA_LAYER_DIR.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))
if str(DATA_LAYER_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_LAYER_DIR))

PROCESSED_DIR = DATA_LAYER_DIR / "data" / "processed"
MODEL_DIR = DATA_LAYER_DIR / "data" / "models"

# 26 Core Predictor Features mapped from PHC Pulse Guide Section 4.1
FEATURE_COLUMNS = [
    # Reporting dynamics (silence treated as primary signal)
    "weeks_since_last_report",
    "reporting_completeness_4w",
    "reporting_completeness_12w",
    "reporting_trend",
    "avg_reporting_delay_days",
    # Stock and consumption signals
    "reported_stock_to_consumption_ratio",
    "estimated_effective_stock_weeks",
    "reported_stockout_rate_12w",
    # Facility operational capacity
    "is_rural",
    "total_staff",
    "nurses_midwives_count",
    "chew_count",
    "doctors_count",
    "has_cold_chain",
    "has_solar_power",
    "has_borehole_water",
    "catchment_population",
    "transport_access_difficulty",
    "gsm_connectivity_score",
    # Real LGA baseline epidemiological & poverty priors
    "lga_poverty_mpi",
    "lga_full_immunization_rate",
    "lga_anc4_coverage_rate",
    "lga_under5_mortality_per_1k",
    "lga_malaria_endemicity_score",
    "lga_cholera_risk_score",
    "lga_road_access_index",
]

TARGET_COLUMN = "ground_truth_risk_score"


@dataclass
class RiskFactorDetail:
    factor: str
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    points: float
    description: str


@dataclass
class FacilityRiskResult:
    facility_id: str
    facility_name: str
    state: str
    lga_name: str
    facility_type: str
    latitude: float
    longitude: float
    is_rural: bool
    total_staff: int
    has_cold_chain: bool
    # Risk Scores
    base_risk_score: float
    adjusted_cascading_score: float
    cascading_delta: float
    risk_tier: str  # LOW, MEDIUM, HIGH, CRITICAL
    # Anomaly / Status flags
    is_silent: bool
    is_hidden_risk: bool
    # Explainability
    top_reason_summary: str
    detailed_reasons: list[str] = field(default_factory=list)
    risk_factors: list[RiskFactorDetail] = field(default_factory=list)
    # Context
    lga_poverty_mpi: float = 0.0
    weeks_since_last_report: int = 0
    estimated_effective_stock_weeks: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["risk_factors"] = [asdict(rf) for rf in self.risk_factors]
        return d


def determine_risk_tier(score: float) -> str:
    "Classifies risk score into health planning action tiers."
    if score >= 70.0:
        return "CRITICAL"
    if score >= 50.0:
        return "HIGH"
    if score >= 30.0:
        return "MEDIUM"
    return "LOW"


def generate_explainable_reasons(row: pd.Series | dict[str, Any]) -> tuple[str, list[str], list[RiskFactorDetail]]:
    """
    Builds human-readable explanations and prioritized risk factor breakdowns
    from raw facility indicators (PHC Pulse Guide Section 4.3).
    """
    reasons: list[str] = []
    factors: list[RiskFactorDetail] = []

    weeks_silent = int(row.get("weeks_since_last_report", 0))
    if weeks_silent >= 4:
        pts = min(25.0, 10.0 + weeks_silent * 2.5)
        reasons.append(f"{weeks_silent}-week reporting gap (silent decay)")
        factors.append(
            RiskFactorDetail(
                factor="Reporting Silence",
                severity="CRITICAL" if weeks_silent >= 6 else "HIGH",
                points=pts,
                description=f"Facility has not submitted stock reports for {weeks_silent} weeks; high likelihood of unobserved stockout.",
            )
        )
    elif weeks_silent >= 2:
        reasons.append("Irregular reporting pattern")
        factors.append(
            RiskFactorDetail(
                factor="Reporting Friction",
                severity="MEDIUM",
                points=10.0,
                description=f"Facility missed reports in the last {weeks_silent} weeks.",
            )
        )

    # Cold chain capability
    has_cold = bool(row.get("has_cold_chain", 0))
    has_solar = bool(row.get("has_solar_power", 0))
    if not has_cold:
        reasons.append("no cold chain")
        factors.append(
            RiskFactorDetail(
                factor="Cold Chain Absence",
                severity="HIGH",
                points=20.0,
                description="Zero functional refrigeration; unable to store Pentavalent, Measles, or BCG vaccines.",
            )
        )
    elif not has_solar:
        reasons.append("cold chain lacks solar backup")
        factors.append(
            RiskFactorDetail(
                factor="Power Reliability",
                severity="MEDIUM",
                points=8.0,
                description="Refrigeration exists but lacks solar backup, creating cold chain breach vulnerability.",
            )
        )

    # Staffing deficit
    staff = int(row.get("total_staff", 0))
    nurses = int(row.get("nurses_midwives_count", 0))
    if staff <= 2:
        reasons.append(f"severe staffing deficit ({staff} staff)")
        factors.append(
            RiskFactorDetail(
                factor="Staffing Shortage",
                severity="CRITICAL",
                points=18.0,
                description=f"Only {staff} healthcare personnel on duty to serve catchment population.",
            )
        )
    elif nurses == 0:
        reasons.append("no qualified nurses/midwives")
        factors.append(
            RiskFactorDetail(
                factor="Maternal Care Deficit",
                severity="HIGH",
                points=12.0,
                description="Zero nurses or midwives available for maternal delivery and oxytocin administration.",
            )
        )

    # Effective stock buffer
    stock_weeks = float(row.get("estimated_effective_stock_weeks", 4.0))
    stockout_rate = float(row.get("reported_stockout_rate_12w", 0.0))
    if stock_weeks <= 1.0 or stockout_rate >= 0.4:
        reasons.append("critical stock depletion")
        factors.append(
            RiskFactorDetail(
                factor="Stock Buffer",
                severity="CRITICAL",
                points=22.0,
                description=f"Estimated effective stock covers only {stock_weeks:.1f} weeks of consumption.",
            )
        )
    elif stock_weeks <= 2.0:
        reasons.append("low stock buffer")
        factors.append(
            RiskFactorDetail(
                factor="Stock Buffer",
                severity="MEDIUM",
                points=12.0,
                description=f"Stock covers under {stock_weeks:.1f} weeks; resupply cycle overdue.",
            )
        )

    # Geographic and transport isolation
    is_rural = bool(row.get("is_rural", 0))
    transport_diff = float(row.get("transport_access_difficulty", 0.5))
    if is_rural and transport_diff >= 0.6:
        reasons.append("remote rural logistics friction")
        factors.append(
            RiskFactorDetail(
                factor="Logistics Access",
                severity="HIGH",
                points=12.0,
                description="High transit difficulty hinders timely drug resupply and supervisor visits.",
            )
        )
    elif is_rural:
        reasons.append("rural catchment")

    # LGA Poverty burden
    poverty_mpi = float(row.get("lga_poverty_mpi", 0.0))
    if poverty_mpi >= 0.50:
        reasons.append(f"extreme poverty LGA (MPI {poverty_mpi:.2f})")
        factors.append(
            RiskFactorDetail(
                factor="Community Vulnerability",
                severity="HIGH",
                points=14.0,
                description=f"LGA multidimensional poverty index is {poverty_mpi:.2f}; patients have zero private care alternatives.",
            )
        )

    # Summary synthesis
    if reasons:
        summary = " • ".join(reasons[:3])
    else:
        summary = "Operating within normal baseline capacity"

    return summary, reasons, factors


class RiskEngine:
    """
    Core Machine Learning & Spatial Cascading Risk Engine.

    Combines:
    Scikit-Learn GradientBoostingRegressor for calibrated base risk scoring.
    Multi-hop spatial network propagation for cascading overflow risk.
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.model: GradientBoostingRegressor | None = None
        self.feature_names = FEATURE_COLUMNS
        self.is_fitted = False
        self.feature_importances_: dict[str, float] = {}

    def fit(self, features_df: pd.DataFrame) -> dict[str, float]:
        """
        Fits a Gradient Boosting model on facility features.
        Predicts continuous ground truth risk score (0-100).
        """
        missing_cols = [c for c in self.feature_names if c not in features_df.columns]
        if missing_cols:
            raise ValueError(f"Features DataFrame is missing required columns: {missing_cols}")

        X = features_df[self.feature_names].fillna(0.0)
        y = features_df[TARGET_COLUMN].values

        # Lightweight, fast gradient boosted tree ensemble
        self.model = GradientBoostingRegressor(
            n_estimators=100,
            learning_rate=0.08,
            max_depth=4,
            subsample=0.85,
            random_state=self.random_state,
        )
        self.model.fit(X, y)
        self.is_fitted = True

        # Compute performance metrics
        preds = self.model.predict(X)
        mae = float(mean_absolute_error(y, preds))
        r2 = float(r2_score(y, preds))

        # Store feature importances
        importances = self.model.feature_importances_
        self.feature_importances_ = {
            name: round(float(imp), 4)
            for name, imp in sorted(zip(self.feature_names, importances), key=lambda x: x[1], reverse=True)
        }

        print(f"[RiskEngine] Model trained successfully (MAE: {mae:.2f}, R²: {r2:.3f})")
        return {"mae": mae, "r2": r2}

    def predict_base_scores(self, features_df: pd.DataFrame) -> np.ndarray:
        "Computes ase risk scores (0.0 to 100.0) for a batch of facilities."
        if not self.is_fitted or self.model is None:
            raise RuntimeError("RiskEngine model has not been fitted or loaded yet. Call fit() first.")

        X = features_df[self.feature_names].fillna(0.0)
        raw_scores = self.model.predict(X)
        # Calibrate and clamp between 0.0 and 100.0
        scores = np.clip(np.round(raw_scores, 1), 0.0, 100.0)
        return scores

    def propagate_cascading_risk(
        self,
        facilities_df: pd.DataFrame,
        edges_df_or_list: pd.DataFrame | list[dict],
        hop1_weight: float = 0.35,
        hop2_weight: float = 0.18,
    ) -> pd.DataFrame:
        """
        Propagates patient redirection stress across the facility network (PHC Pulse Guide Section 5).

        When a facility runs short of stock or staff, patients travel to neighboring facilities.
        This function:
        1. Distributes Hop 1 stress from each source facility to its directed neighbors using overflow_weight.
        2. Distributes Hop 2 secondary stress outward from Hop 1 receivers.
        3. Computes adjusted_cascading_score and flags 'is_hidden_risk' facilities.
        """
        df = facilities_df.copy()
        if "base_risk_score" not in df.columns:
            df["base_risk_score"] = self.predict_base_scores(df)

        if isinstance(edges_df_or_list, list):
            edges_df = pd.DataFrame(edges_df_or_list)
        else:
            edges_df = edges_df_or_list.copy()

        # Build lookup maps
        fac_score_map = dict(zip(df["facility_id"], df["base_risk_score"]))

        # --- HOP 1: Direct neighboring stress transfer ---
        hop1_incoming: dict[str, float] = {fid: 0.0 for fid in fac_score_map}

        for _, edge in edges_df.iterrows():
            src_id = edge["source_facility_id"]
            tgt_id = edge["target_facility_id"]
            overflow_wt = float(edge.get("overflow_weight", 0.33))

            src_stress = fac_score_map.get(src_id, 0.0)
            transferred = src_stress * overflow_wt * hop1_weight
            hop1_incoming[tgt_id] = hop1_incoming.get(tgt_id, 0.0) + transferred

        # --- HOP 2: Secondary outward cascade ---
        hop2_incoming: dict[str, float] = {fid: 0.0 for fid in fac_score_map}

        # Map edges by source for fast traversal
        edges_by_src: dict[str, list[dict]] = {}
        for _, edge in edges_df.iterrows():
            src = edge["source_facility_id"]
            if src not in edges_by_src:
                edges_by_src[src] = []
            edges_by_src[src].append(edge)

        for fid, stress1 in hop1_incoming.items():
            if stress1 <= 2.0:
                continue
            neighbors = edges_by_src.get(fid, [])
            for n_edge in neighbors:
                tgt_id = n_edge["target_facility_id"]
                if tgt_id == fid:
                    continue
                w = float(n_edge.get("overflow_weight", 0.33))
                hop2_transferred = stress1 * w * hop2_weight
                hop2_incoming[tgt_id] = hop2_incoming.get(tgt_id, 0.0) + hop2_transferred

        # --- Compute final adjusted scores & hidden risk flags ---
        total_cascading_deltas = []
        adjusted_scores = []
        is_hidden_risks = []
        risk_tiers = []

        for _, row in df.iterrows():
            fid = row["facility_id"]
            base = float(row["base_risk_score"])
            stress = hop1_incoming.get(fid, 0.0) + hop2_incoming.get(fid, 0.0)
            delta = round(stress, 1)

            adj = round(min(100.0, base + delta), 1)
            total_cascading_deltas.append(delta)
            adjusted_scores.append(adj)

            # Hidden risk: facility looks individually moderate/low (< 50) but adjusted score surges to >= 65
            hidden = bool(base < 50.0 and adj >= 65.0) or bool(base < 45.0 and delta >= 20.0)
            is_hidden_risks.append(hidden)
            risk_tiers.append(determine_risk_tier(adj))

        df["cascading_delta"] = total_cascading_deltas
        df["adjusted_cascading_score"] = adjusted_scores
        df["is_hidden_risk"] = is_hidden_risks
        df["risk_tier"] = risk_tiers

        return df

    def evaluate_facilities(
        self,
        features_df: pd.DataFrame,
        edges_data: pd.DataFrame | list[dict],
    ) -> list[FacilityRiskResult]:
        """
        Runs full pipeline:
        1. Predicts base scores
        2. Applies spatial cascading propagation
        3. Formats explainable reasons and risk factor breakdowns
        """
        if not self.is_fitted:
            self.fit(features_df)

        scored_df = self.propagate_cascading_risk(features_df, edges_data)

        results: list[FacilityRiskResult] = []
        for _, row in scored_df.iterrows():
            summary, reasons, factors = generate_explainable_reasons(row)

            # If the facility is under cascading strain, add spatial context
            if row.get("is_hidden_risk", False):
                summary = f"⚠️ Hidden Risk Surge (+{row['cascading_delta']:.0f} pts from neighbor stress) • " + summary
                reasons.insert(
                    0,
                    f"Surrounded by overburdened neighboring facilities absorbing patient overflow (+{row['cascading_delta']:.1f} cascading stress)",
                )
                factors.insert(
                    0,
                    RiskFactorDetail(
                        factor="Cascading Spillover",
                        severity="CRITICAL",
                        points=float(row["cascading_delta"]),
                        description="Nearby facilities have severe stockouts/delays; patient redirection will overwhelm this site.",
                    ),
                )

            res = FacilityRiskResult(
                facility_id=str(row["facility_id"]),
                facility_name=str(row["facility_name"]),
                state=str(row["state"]),
                lga_name=str(row["lga_name"]),
                facility_type=str(row["facility_type"]),
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                is_rural=bool(row["is_rural"]),
                total_staff=int(row["total_staff"]),
                has_cold_chain=bool(row["has_cold_chain"]),
                base_risk_score=float(row["base_risk_score"]),
                adjusted_cascading_score=float(row["adjusted_cascading_score"]),
                cascading_delta=float(row["cascading_delta"]),
                risk_tier=str(row["risk_tier"]),
                is_silent=bool(row.get("weeks_since_last_report", 0) >= 3),
                is_hidden_risk=bool(row.get("is_hidden_risk", False)),
                top_reason_summary=summary,
                detailed_reasons=reasons,
                risk_factors=factors,
                lga_poverty_mpi=float(row.get("lga_poverty_mpi", 0.0)),
                weeks_since_last_report=int(row.get("weeks_since_last_report", 0)),
                estimated_effective_stock_weeks=float(row.get("estimated_effective_stock_weeks", 0.0)),
            )
            results.append(res)

        return results

    def simulate_facility_shock(
        self,
        source_facility_id: str,
        shock_magnitude: float = 35.0,
        scored_results: list[FacilityRiskResult] | None = None,
        edges_data: list[dict] | None = None,
    ) -> dict[str, Any]:
        """
        Simulates an exogenous supply or staffing shock at a specific facility and tracks
        its multi-hop propagation across adjacent primary healthcare centers.
        """
        if scored_results is None or edges_data is None:
            raise ValueError("scored_results and edges_data must be provided for shock simulation.")

        fac_map = {f.facility_id: f for f in scored_results}
        source_fac = fac_map.get(source_facility_id)
        if not source_fac:
            raise ValueError(f"Facility ID '{source_facility_id}' not found.")

        # Outgoing edges from source
        hop1_edges = [e for e in edges_data if e["source_facility_id"] == source_facility_id]
        hop1_impacts = []
        hop1_fids = set()

        for e in hop1_edges:
            tgt_id = e["target_facility_id"]
            tgt = fac_map.get(tgt_id)
            if not tgt:
                continue

            overflow_w = float(e.get("overflow_weight", 0.33))
            added = round(shock_magnitude * overflow_w, 1)
            orig = tgt.adjusted_cascading_score
            new_score = round(min(100.0, orig + added), 1)

            hop1_impacts.append(
                {
                    "facility_id": tgt.facility_id,
                    "facility_name": tgt.facility_name,
                    "distance_km": float(e["distance_km"]),
                    "overflow_weight": overflow_w,
                    "original_risk": orig,
                    "added_risk": added,
                    "new_risk": new_score,
                    "jumped_to_critical": bool(new_score >= 70.0 and orig < 70.0),
                }
            )
            hop1_fids.add(tgt_id)

        # Hop 2 secondary propagation
        hop2_impacts = []
        visited_hop2 = set()

        for h1 in hop1_impacts:
            h2_edges = [e for e in edges_data if e["source_facility_id"] == h1["facility_id"]]
            for e2 in h2_edges:
                tgt2_id = e2["target_facility_id"]
                if tgt2_id == source_facility_id or tgt2_id in hop1_fids or tgt2_id in visited_hop2:
                    continue

                tgt2 = fac_map.get(tgt2_id)
                if not tgt2:
                    continue

                w2 = float(e2.get("overflow_weight", 0.33))
                secondary_shock = h1["added_risk"] * 0.50
                added2 = round(secondary_shock * w2, 1)
                orig2 = tgt2.adjusted_cascading_score
                new_score2 = round(min(100.0, orig2 + added2), 1)

                hop2_impacts.append(
                    {
                        "facility_id": tgt2.facility_id,
                        "facility_name": tgt2.facility_name,
                        "originating_hop1_id": h1["facility_id"],
                        "distance_km": float(e2["distance_km"]),
                        "overflow_weight": w2,
                        "original_risk": orig2,
                        "added_risk": added2,
                        "new_risk": new_score2,
                        "jumped_to_critical": bool(new_score2 >= 70.0 and orig2 < 70.0),
                    }
                )
                visited_hop2.add(tgt2_id)

        destabilized_count = sum(1 for h in hop1_impacts if h["jumped_to_critical"]) + sum(
            1 for h in hop2_impacts if h["jumped_to_critical"]
        )

        return {
            "source_facility": {
                "facility_id": source_fac.facility_id,
                "facility_name": source_fac.facility_name,
                "applied_shock": shock_magnitude,
                "base_score": source_fac.base_risk_score,
            },
            "hop1_neighbors": hop1_impacts,
            "hop2_neighbors": hop2_impacts,
            "total_destabilized_to_critical": destabilized_count,
        }

    def save(self, filepath: Path | str | None = None) -> Path:
        """Saves trained model and metadata to disk."""
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Cannot save unfitted model.")

        path = Path(filepath) if filepath else MODEL_DIR / "risk_scoring_model.joblib"
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "model": self.model,
            "feature_names": self.feature_names,
            "feature_importances": self.feature_importances_,
            "random_state": self.random_state,
        }
        joblib.dump(payload, path)
        print(f"[RiskEngine] Saved trained model to {path}")
        return path

    def load(self, filepath: Path | str | None = None) -> None:
        """Loads trained model and metadata from disk."""
        path = Path(filepath) if filepath else MODEL_DIR / "risk_scoring_model.joblib"
        if not path.exists():
            raise FileNotFoundError(f"No saved model found at {path}")

        payload = joblib.load(path)
        self.model = payload["model"]
        self.feature_names = payload["feature_names"]
        self.feature_importances_ = payload.get("feature_importances", {})
        self.random_state = payload.get("random_state", 42)
        self.is_fitted = True
        print(f"[RiskEngine] Loaded trained model from {path}")


def run_risk_engine(
    features_path: Path | None = None,
    edges_path: Path | None = None,
    output_dir: Path | None = None,
) -> tuple[pd.DataFrame, list[FacilityRiskResult]]:
    """
    Convenience entrypoint to execute the Risk Engine end-to-end on data layer files.
    """
    feat_file = features_path or PROCESSED_DIR / "facility_features.parquet"
    edge_file = edges_path or PROCESSED_DIR / "facility_graph_edges.json"
    out_dir = output_dir or PROCESSED_DIR

    print("\nPHC PULSE RISK ENGINE")
    print(f"Loading feature matrix from {feat_file.name}")
    df_features = pd.read_parquet(feat_file)
    print(f"Loaded {len(df_features)} facilities with {len(df_features.columns)} features.")

    print(f"Loading network edges from {edge_file.name}")
    with open(edge_file, "r", encoding="utf-8") as f:
        edges_data = json.load(f)
    print(f"Loaded {len(edges_data)} spatial network edges.")

    engine = RiskEngine(random_state=42)
    engine.fit(df_features)

    # Save trained model artifact
    engine.save()

    print("\nEvaluating facility risk profiles and propagating spatial cascades")
    results = engine.evaluate_facilities(df_features, edges_data)

    # Convert to DataFrame for persistence
    results_records = [r.to_dict() for r in results]
    results_df = pd.DataFrame(results_records)

    # Export to Parquet and JSON
    out_dir.mkdir(parents=True, exist_ok=True)
    parquet_out = out_dir / "facility_risk_scores.parquet"
    json_out = out_dir / "facility_risk_scores.json"

    # For parquet, serialize nested lists/dicts to strings or flatten
    flat_df = results_df.copy()
    flat_df["detailed_reasons"] = flat_df["detailed_reasons"].apply(json.dumps)
    flat_df["risk_factors"] = flat_df["risk_factors"].apply(json.dumps)
    flat_df.to_parquet(parquet_out, index=False)

    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(results_records, f, indent=2)

    print(f"Saved {len(results_df)} scored facilities to {parquet_out.name} and {json_out.name}")

    # Summary Statistics
    critical_count = sum(1 for r in results if r.risk_tier == "CRITICAL")
    high_count = sum(1 for r in results if r.risk_tier == "HIGH")
    hidden_count = sum(1 for r in results if r.is_hidden_risk)
    silent_count = sum(1 for r in results if r.is_silent)

    print("\nTriage Summary:")
    print(f"Critical Risk: {critical_count} ({critical_count / len(results):.1%})")
    print(f"High Risk:     {high_count} ({high_count / len(results):.1%})")
    print(f"Hidden Risk:   {hidden_count} facilities (isolated score low, but neighbor strain pushes into danger)")
    print(f"Silent:        {silent_count} facilities (>= 3 weeks reporting gap)")

    print("\nTop Contributing Features to Risk Model:")
    for feat, imp in list(engine.feature_importances_.items())[:6]:
        print(f"  {feat}: {imp:.1%}")

    return flat_df, results


if __name__ == "__main__":
    run_risk_engine()
