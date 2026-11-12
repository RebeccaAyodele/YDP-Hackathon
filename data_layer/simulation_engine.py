import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

try:
    from data_layer.commodities import ESSENTIAL_COMMODITIES, CommoditySpec
    from data_layer.facility_generator import FacilityRecord
    from data_layer.real_indicators import get_lga_indicators_map
except ImportError:
    from commodities import ESSENTIAL_COMMODITIES, CommoditySpec
    from facility_generator import FacilityRecord
    from real_indicators import get_lga_indicators_map


@dataclass
class WeeklyCommodityEvent:
    facility_id: str
    lga_id: str
    week_number: int  # 1 to 52 for entire year
    commodity_id: str
    commodity_name: str
    requires_cold_chain: bool

    # Underlying Ground Truth (Physical Reality)
    beginning_stock: float
    simulated_demand: float
    actual_consumption: float
    resupply_received: float
    ending_stock: float
    is_stockout: bool  # Ending stock == 0 or unmet demand > 0
    days_stocked_out: int  # 0 to 7 days
    unmet_demand: float
    cold_chain_breach: bool  # True if vaccine spoiled due to power failure

    # Reported Observation
    report_submitted: bool  # Did the facility submit the weekly report?
    consecutive_reports_missed: int  # How many consecutive weeks has this facility gone silent?
    reported_stock: float | None
    reported_consumption: float | None
    reported_days_stocked_out: int | None
    report_delay_days: int | None  # Latency in transmission (2 to 24 days)


class StockSimulationEngine:
    """
    Simulates weekly commodity stock levels and reporting behaviors across facilities.
    """

    def __init__(
        self,
        facilities: list[FacilityRecord],
        commodities: list[CommoditySpec] | None = None,
        num_weeks: int = 52,
        seed: int = 101,
    ):
        self.facilities = facilities
        self.commodities = commodities or ESSENTIAL_COMMODITIES
        self.commodities_map = {c.commodity_id: c for c in self.commodities}
        self.num_weeks = num_weeks
        self.seed = seed
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)
        self.lga_map = get_lga_indicators_map()

    def _is_southern_region(self, facility: FacilityRecord | None) -> bool:
        """
        Determines whether facility is in the south else, north
        South: South West (SW), South South (SS), South East (SE).
        North: North West (NW), North East (NE), North Central (NC).
        """
        if facility is None:
            return False
        zone = getattr(facility, "geopolitical_zone", "")
        if zone in ["South West", "South South", "South East"]:
            return True
        if zone in ["North West", "North East", "North Central"]:
            return False
        lat = getattr(facility, "latitude", None)
        return (lat < 8.0) if lat is not None else False

    def _calculate_seasonality_factor(
        self, commodity: CommoditySpec, week: int, facility: FacilityRecord | None = None
    ) -> float:
        """
        Calculates seasonal surge factor for a given epidemiological week.

        Nigeria's Seasons (South vs North):
        1. Rainy Season (Malaria ACTs, RDTs, ORS+Zinc Diarrhoea):
            a) South (SW, SS, SE): March/April to October/November (Weeks 12-46)
                Two peaks (bimodal): heaviest in June-July (Week 26), August break, then September (Week 37).
            b) North (NW, NE, NC): May/June to September (Weeks 20-39)
                Single peak (unimodal) in July-August (Week 31), shorter season.

        2. Harmattan / Dry Season (Childhood Pneumonia/Amoxicillin, Measles Vaccine):
            a) South (SW, SS, SE): December to February (Weeks 49-52 and Weeks 1-8)
                Milder, shorter, less intense - felt mainly Dec-Jan.
            b) North (NW, NE, NC): November to March (Weeks 45-52 and Weeks 1-13)
                Earlier, longer, more severe - dry dusty winds from the Sahara.
        """
        if commodity.seasonal_peak == "none":
            return 1.0

        is_south = self._is_southern_region(facility)

        # rainy season
        if commodity.seasonal_peak == "rainy":
            if is_south:
                # South: March/April to Oct/Nov (Weeks 12 to 46)
                # Peaks: June-July (Week 26, primary) and September (Week 37, secondary)
                if 12 <= week <= 46:
                    w1 = math.cos(((week - 26) / 8.0) * (math.pi / 2.0)) if abs(week - 26) < 8 else 0.0
                    w2 = 0.85 * math.cos(((week - 37) / 6.0) * (math.pi / 2.0)) if abs(week - 37) < 6 else 0.0
                    # August break keeps baseline elevated while dipping between the two peaks
                    august_floor = 0.40 if 14 <= week <= 44 else 0.0
                    weight = max(w1, w2, august_floor)
                    return 1.0 + (commodity.seasonal_multiplier - 1.0) * weight
                return 1.0
            else:
                # North: May/June to September (Weeks 20 to 39)
                if 20 <= week <= 39:
                    diff = abs(week - 31)
                    if diff < 10:
                        weight = math.cos((diff / 10.0) * (math.pi / 2.0))
                        return 1.0 + (commodity.seasonal_multiplier - 1.0) * weight
                return 1.0

        # HARMATTAN OR DRY SEASON
        if commodity.seasonal_peak in ["harmattan", "dry"]:
            # Wrap around calendar year boundary end of year to start of the year
            rel_week = week - 52 if week >= 45 else week

            if is_south:
                # South: December to February (Weeks 49-52 and 1-8)
                # Milder, shorter, less intense - felt mainly Dec-Jan
                if -3 <= rel_week <= 8:
                    diff = abs(rel_week - 1)
                    if diff < 6:
                        weight = 0.70 * math.cos((diff / 6.0) * (math.pi / 2.0))
                        return 1.0 + (commodity.seasonal_multiplier - 1.0) * weight
                return 1.0
            else:
                # North: November to March (Weeks 45-52 and 1-13)
                # Earlier, longer, more severe
                if -7 <= rel_week <= 13:
                    diff = abs(rel_week - 3)
                    if diff < 10:
                        weight = math.cos((diff / 10.0) * (math.pi / 2.0))
                        return 1.0 + (commodity.seasonal_multiplier - 1.0) * weight
                return 1.0

        return 1.0

    def _initial_stock_level(self, facility: FacilityRecord, commodity: CommoditySpec):
        """
        Determines realistic starting inventory at Week 0.
        Urban facilities hold 4 to 8 weeks of buffer; rural facilities start with 1 to 4 weeks
        """
        lga = self.lga_map.get(facility.lga_id)
        disease_burden = (
            lga.malaria_endemicity_score
            if "malaria" in commodity.commodity_id or "act" in commodity.commodity_id
            else 1.0
        )

        weekly_base = commodity.base_weekly_per_1k * (facility.catchment_population / 1000.0) * disease_burden

        if commodity.requires_cold_chain and not facility.has_cold_chain:
            return 0.0

        if facility.is_rural:
            weeks_buffer = self.rng.uniform(1.2, 4.0)
        else:
            weeks_buffer = self.rng.uniform(3.5, 7.5)

        stock = weekly_base * weeks_buffer
        jitter = self.rng.uniform(0.75, 1.25)
        return max(0.0, round(stock * jitter, 1))

    def _is_resupply_week(self, facility: FacilityRecord, week: int):
        """
        Determines if a delivery is scheduled/arrives this week.
        Urban: regular monthly or 5-week cycle.
        Rural: irregular, 8 to 14 week intervals with seasonal washout interruptions.
        """
        if not facility.is_rural:
            cycle = 4
            offset = hash(facility.facility_id) % cycle
            return (week % cycle) == offset
        else:
            cycle = 9
            offset = hash(facility.facility_id) % cycle
            scheduled = (week % cycle) == offset

            if facility.transport_access_difficulty > 0.65:
                is_south = self._is_southern_region(facility)
                washout_weeks = (24 <= week <= 30 or 35 <= week <= 39) if is_south else (28 <= week <= 34)
                if washout_weeks and self.rng.random() < 0.45:
                    return False
            return scheduled

    def _calculate_resupply_quantity(self, facility: FacilityRecord, commodity: CommoditySpec, current_stock: float):
        """
        Calculates resupply replenishment amount.
        Accounts for order fulfillment quotas and central depot constraints.
        """
        lga = self.lga_map.get(facility.lga_id)
        disease_burden = (
            lga.malaria_endemicity_score
            if "malaria" in commodity.commodity_id or "act" in commodity.commodity_id
            else 1.0
        )

        weekly_base = commodity.base_weekly_per_1k * (facility.catchment_population / 1000.0) * disease_burden
        target_buffer_weeks = 8.0 if facility.is_rural else 5.0
        target_level = weekly_base * target_buffer_weeks
        deficit = max(0.0, target_level - current_stock)

        if deficit <= 0:
            return 0.0

        if facility.is_rural:
            fulfillment_rate = self.rng.uniform(0.60, 0.88)
        else:
            fulfillment_rate = self.rng.uniform(0.88, 1.00)

        quantity = round(deficit * fulfillment_rate, 1)
        return max(0.0, quantity)

    def run_simulation(self):
        """
        Executes the week-by-week mechanistic simulation across all facilities.
        Returns:
            DataFrame of all weekly events
            Summary dictionary of latest facility states (Week 52)
        """
        records: list[WeeklyCommodityEvent] = []

        # Track facility-level running state
        state_tracker: dict[str, dict] = {}

        for facility in self.facilities:
            state_tracker[facility.facility_id] = {
                "consecutive_misses": 0,
                "current_stock": {c.commodity_id: self._initial_stock_level(facility, c) for c in self.commodities},
            }

        for week in range(1, self.num_weeks + 1):
            for facility in self.facilities:
                f_state = state_tracker[facility.facility_id]
                consecutive_misses = f_state["consecutive_misses"]
                lga = self.lga_map.get(facility.lga_id)

                decay_factor = 0.72  # Silence compounds
                current_report_prob = facility.baseline_reporting_prob * (decay_factor ** min(5, consecutive_misses))

                num_stocked_out_prev = sum(1 for s in f_state["current_stock"].values() if s <= 0)
                if num_stocked_out_prev >= 3:
                    current_report_prob *= 0.80

                report_submitted = self.rng.random() < current_report_prob

                if report_submitted:
                    f_state["consecutive_misses"] = 0
                    current_misses_for_event = 0
                    if facility.is_rural:
                        delay_days = int(self.rng.triangular(4, 21, 10))
                    else:
                        delay_days = int(self.rng.triangular(1, 6, 2))
                else:
                    f_state["consecutive_misses"] += 1
                    current_misses_for_event = f_state["consecutive_misses"]
                    delay_days = None

                is_resupply = self._is_resupply_week(facility, week)

                for commodity in self.commodities:
                    beg_stock = f_state["current_stock"][commodity.commodity_id]

                    breach = False
                    if commodity.requires_cold_chain and facility.has_cold_chain:
                        breach_risk = 0.03 if facility.is_rural else 0.008
                        if self.rng.random() < breach_risk:
                            breach = True
                            beg_stock = 0.0

                    seasonality = self._calculate_seasonality_factor(commodity, week, facility)
                    disease_factor = (
                        lga.malaria_endemicity_score
                        if "malaria" in commodity.commodity_id or "act" in commodity.commodity_id
                        else 1.0
                    )

                    expected_weekly = (
                        commodity.base_weekly_per_1k
                        * (facility.catchment_population / 1000.0)
                        * seasonality
                        * disease_factor
                    )

                    actual_demand = max(
                        0.0, float(self.np_rng.normal(loc=expected_weekly, scale=max(1.0, expected_weekly * 0.18)))
                    )
                    actual_demand = round(actual_demand, 1)

                    if beg_stock >= actual_demand:
                        consumption = actual_demand
                        unmet = 0.0
                        ending_before_resupply = beg_stock - consumption
                        is_stockout = False
                        days_stocked_out = 0
                    else:
                        consumption = beg_stock
                        unmet = round(actual_demand - beg_stock, 1)
                        ending_before_resupply = 0.0
                        is_stockout = True
                        if actual_demand > 0:
                            fraction_served = beg_stock / actual_demand
                            days_stocked_out = min(7, max(1, round((1.0 - fraction_served) * 7)))
                        else:
                            days_stocked_out = 7

                    resupply_amount = 0.0
                    if is_resupply and not (commodity.requires_cold_chain and not facility.has_cold_chain):
                        resupply_amount = self._calculate_resupply_quantity(
                            facility=facility, commodity=commodity, current_stock=ending_before_resupply
                        )

                    ending_stock = round(ending_before_resupply + resupply_amount, 1)
                    f_state["current_stock"][commodity.commodity_id] = ending_stock

                    if report_submitted:
                        counting_noise = self.rng.uniform(0.96, 1.04)
                        rep_stock = max(0.0, round(ending_stock * counting_noise, 1))
                        rep_consumption = max(0.0, round(consumption * counting_noise, 1))
                        rep_stockout_days = days_stocked_out
                    else:
                        rep_stock = None
                        rep_consumption = None
                        rep_stockout_days = None

                    event = WeeklyCommodityEvent(
                        facility_id=facility.facility_id,
                        lga_id=facility.lga_id,
                        week_number=week,
                        commodity_id=commodity.commodity_id,
                        commodity_name=commodity.name,
                        requires_cold_chain=commodity.requires_cold_chain,
                        beginning_stock=round(beg_stock, 1),
                        simulated_demand=actual_demand,
                        actual_consumption=round(consumption, 1),
                        resupply_received=resupply_amount,
                        ending_stock=ending_stock,
                        is_stockout=is_stockout,
                        days_stocked_out=days_stocked_out,
                        unmet_demand=unmet,
                        cold_chain_breach=breach,
                        report_submitted=report_submitted,
                        consecutive_reports_missed=current_misses_for_event,
                        reported_stock=rep_stock,
                        reported_consumption=rep_consumption,
                        reported_days_stocked_out=rep_stockout_days,
                        report_delay_days=delay_days,
                    )
                    records.append(event)

        df = pd.DataFrame([r.__dict__ for r in records])
        return df, state_tracker

    def export_dataset(self, output_path: Path | None = None, save_to_disk: bool = False):
        df, _ = self.run_simulation()
        if save_to_disk and output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(output_path.with_suffix(".parquet"), index=False)
            df.to_csv(output_path.with_suffix(".csv"), index=False)
        return df
