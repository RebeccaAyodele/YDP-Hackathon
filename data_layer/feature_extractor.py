from typing import Dict, List, Optional
import pandas as pd
import numpy as np
import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from data_layer.real_indicators import get_lga_indicators_map
from data_layer.facility_generator import FacilityRecord


class FacilityFeatureExtractor:
    """Extracts facility-level feature representations from simulated reporting history."""

    def __init__(
        self,
        facilities: List[FacilityRecord],
        simulation_df: pd.DataFrame,
        eval_week: int = 52
    ):
        self.facilities = facilities
        self.facilities_map = {f.facility_id: f for f in facilities}
        self.simulation_df = simulation_df
        self.eval_week = eval_week
        self.lga_map = get_lga_indicators_map()

    def extract_features(self):
        """
        Computes features for each facility evaluated as of `eval_week`.
        Only uses history <= eval_week.
        """
        history = self.simulation_df[self.simulation_df["week_number"] <= self.eval_week].copy()

        w4_start = max(1, self.eval_week - 3)
        w12_start = max(1, self.eval_week - 11)

        feature_rows: List[Dict] = []
        grouped_history = dict(tuple(history.groupby("facility_id")))

        for facility in self.facilities:
            fid = facility.facility_id
            f_history = grouped_history.get(fid, pd.DataFrame())
            lga = self.lga_map.get(facility.lga_id)

            facility_weeks = f_history[
                [
                    "week_number",
                    "report_submitted",
                    "consecutive_reports_missed",
                    "report_delay_days"
                ]
            ].drop_duplicates()
            facility_weeks = facility_weeks.sort_values("week_number")

            reported_weeks = facility_weeks[facility_weeks["report_submitted"]]["week_number"].tolist()
            if len(reported_weeks) > 0:
                last_reported_week = max(reported_weeks)
                weeks_since_last_report = self.eval_week - last_reported_week
            else:
                last_reported_week = 0
                weeks_since_last_report = self.eval_week

            w4_data = facility_weeks[facility_weeks["week_number"] >= w4_start]
            w4_total = len(w4_data)
            w4_submitted = w4_data["report_submitted"].sum() if w4_total > 0 else 0
            completeness_4w = round(float(w4_submitted) / max(1, w4_total), 3)

            w12_data = facility_weeks[facility_weeks["week_number"] >= w12_start]
            w12_total = len(w12_data)
            w12_submitted = w12_data["report_submitted"].sum() if w12_total > 0 else 0
            completeness_12w = round(float(w12_submitted) / max(1, w12_total), 3)

            reporting_trend = round(completeness_4w - completeness_12w, 3)

            reported_delays = facility_weeks[facility_weeks["report_delay_days"].notnull()]["report_delay_days"]
            avg_delay_days = round(float(reported_delays.mean()), 1) if len(reported_delays) > 0 else 14.0

            submitted_reports = f_history[f_history["report_submitted"]]

            if len(submitted_reports) > 0:
                latest_report_week = submitted_reports["week_number"].max()
                latest_reports = submitted_reports[submitted_reports["week_number"] == latest_report_week]

                ratios = []
                for _, row in latest_reports.iterrows():
                    rep_cons = row.get("reported_consumption", 0.0) or 0.0
                    rep_stk = row.get("reported_stock", 0.0) or 0.0
                    if rep_cons > 0:
                        ratios.append(rep_stk / rep_cons)
                    else:
                        ratios.append(4.0 if rep_stk > 0 else 0.0)

                stock_to_consumption_ratio = round(float(np.mean(ratios)), 2) if ratios else 2.0

                w12_submitted_comm = submitted_reports[submitted_reports["week_number"] >= w12_start]
                if len(w12_submitted_comm) > 0:
                    stockout_rep_count = (w12_submitted_comm["reported_days_stocked_out"] > 0).sum()
                    reported_stockout_rate_12w = round(float(stockout_rep_count) / len(w12_submitted_comm), 3)
                else:
                    reported_stockout_rate_12w = 0.0
            else:
                stock_to_consumption_ratio = 0.0
                reported_stockout_rate_12w = 0.5

            estimated_effective_stock_weeks = max(0.0, stock_to_consumption_ratio - weeks_since_last_report)

            current_week_ground = f_history[f_history["week_number"] == self.eval_week]
            true_stockout_count = int(current_week_ground["is_stockout"].sum())
            true_has_stockout_any = bool(true_stockout_count > 0)
            true_cold_breach = bool(current_week_ground["cold_chain_breach"].any())

            critical_ids = [
                "act_artemether_lumefantrine",
                "oxytocin_injection",
                "penta_vaccine"
            ]
            crit_records = current_week_ground[current_week_ground["commodity_id"].isin(critical_ids)]
            true_critical_stockout = bool(crit_records["is_stockout"].any())

            raw_severity = (true_stockout_count / 8.0) * 60.0
            if true_critical_stockout:
                raw_severity += 25.0
            if true_cold_breach:
                raw_severity += 15.0
            ground_truth_risk_score = round(min(100.0, raw_severity), 1)

            feature_row = {
                "facility_id": facility.facility_id,
                "facility_name": facility.facility_name,
                "facility_type": facility.facility_type,
                "lga_id": facility.lga_id,
                "lga_name": facility.lga_name,
                "state": facility.state,
                "geopolitical_zone": facility.geopolitical_zone,
                "latitude": facility.latitude,
                "longitude": facility.longitude,
                # Reporting dynamics and core signals
                "weeks_since_last_report": weeks_since_last_report,
                "reporting_completeness_4w": completeness_4w,
                "reporting_completeness_12w": completeness_12w,
                "reporting_trend": reporting_trend,
                "is_silent_decaying": bool(weeks_since_last_report >= 3),
                "avg_reporting_delay_days": avg_delay_days,
                # Stock and consumption signals
                "reported_stock_to_consumption_ratio": stock_to_consumption_ratio,
                "estimated_effective_stock_weeks": round(estimated_effective_stock_weeks, 2),
                "reported_stockout_rate_12w": reported_stockout_rate_12w,
                # Basic facility details
                "is_rural": int(facility.is_rural),
                "total_staff": facility.total_staff,
                "nurses_midwives_count": facility.nurses_midwives_count,
                "chew_count": facility.chew_count,
                "doctors_count": facility.doctors_count,
                "has_cold_chain": int(facility.has_cold_chain),
                "has_solar_power": int(facility.has_solar_power),
                "has_borehole_water": int(facility.has_borehole_water),
                "catchment_population": facility.catchment_population,
                "transport_access_difficulty": facility.transport_access_difficulty,
                "gsm_connectivity_score": facility.gsm_connectivity_score,
                # Health and poverty indicators from surveys
                "lga_poverty_mpi": lga.poverty_headcount_mpi if lga else 0.5,
                "lga_full_immunization_rate": lga.full_immunization_rate if lga else 0.5,
                "lga_anc4_coverage_rate": lga.anc4_coverage_rate if lga else 0.5,
                "lga_under5_mortality_per_1k": lga.under5_mortality_per_1k if lga else 90.0,
                "lga_malaria_endemicity_score": lga.malaria_endemicity_score if lga else 0.7,
                "lga_cholera_risk_score": lga.cholera_risk_score if lga else 0.5,
                "lga_road_access_index": lga.road_access_index if lga else 0.6,
                # Real stockout outcomes for testing and training
                "ground_truth_stockout_any": int(true_has_stockout_any),
                "ground_truth_stockout_count": true_stockout_count,
                "ground_truth_critical_stockout": int(true_critical_stockout),
                "ground_truth_risk_score": ground_truth_risk_score
            }
            feature_rows.append(feature_row)

        df = pd.DataFrame(feature_rows)
        return df

    def export_features(self, output_path: Optional[Path] = None, save_to_disk: bool = False):
        """Extracts facility features and returns DataFrame directly for database ingestion."""
        df = self.extract_features()
        if save_to_disk and output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(output_path.with_suffix(".csv"), index=False)
            df.to_parquet(output_path.with_suffix(".parquet"), index=False)
        return df
