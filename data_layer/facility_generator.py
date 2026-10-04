import json
import math
import random
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
import sys
from pathlib import Path
import pandas as pd

# Ensure workspace root is in sys.path for data_layer package resolution
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from data_layer.real_indicators import get_lga_indicators_map


@dataclass
class FacilityRecord:
    facility_id: str
    facility_name: str
    facility_type: str  # "Comprehensive Health Centre", "Primary Health Centre", "Primary Health Clinic", "Health Post"
    lga_id: str
    lga_name: str
    state: str
    geopolitical_zone: str
    ward: str
    latitude: float
    longitude: float
    is_rural: bool
    catchment_population: int
    monthly_under1_target: int
    monthly_pregnant_target: int
    total_staff: int
    nurses_midwives_count: int
    chew_count: int  # Community Health Extension Workers
    doctors_count: int
    has_cold_chain: bool
    cold_chain_type: str  # "Solar Direct Drive (SDD)", "Electric Grid/Backup", "None (Passive carrier only)"
    has_solar_power: bool
    has_borehole_water: bool
    transport_access_difficulty: float  # 0.0 (tarred urban road) to 1.0 (creek speedboat / washed-out track)
    gsm_connectivity_score: float  # Mobile network signal quality (0.0 to 1.0)
    baseline_reporting_prob: float  # Prior probability of submitting weekly report on time
    nhfr_facility_code: Optional[str] = None
    ownership: Optional[str] = "Public"


# Mapping from GRID3 LGA spelling to our canonical lga_id
LGA_NAME_TO_ID = {
    # Lagos
    ("Lagos", "Ikeja"): "lagos_ikeja",
    ("Lagos", "Alimosho"): "lagos_alimosho",
    ("Lagos", "Epe"): "lagos_epe",
    ("Lagos", "Badagry"): "lagos_badagry",
    # Sokoto
    ("Sokoto", "Sokoto South"): "sokoto_south",
    ("Sokoto", "Illela"): "sokoto_illela",
    ("Sokoto", "Tambuwal"): "sokoto_tambuwal",
    ("Sokoto", "Bodinga"): "sokoto_bodinga",
    # Yobe
    ("Yobe", "Damaturu"): "yobe_damaturu",
    ("Yobe", "Geidam"): "yobe_geidam",
    ("Yobe", "Gujba"): "yobe_gujba",
    ("Yobe", "Potiskum"): "yobe_potiskum",
    # Bayelsa
    ("Bayelsa", "Yenagoa"): "bayelsa_yenagoa",
    ("Bayelsa", "Southern Ijaw"): "bayelsa_southern_ijaw",
    ("Bayelsa", "Nembe"): "bayelsa_nembe",
    ("Bayelsa", "Brass"): "bayelsa_brass",
    # Ebonyi
    ("Ebonyi", "Abakaliki"): "ebonyi_abakaliki",
    ("Ebonyi", "Ikwo"): "ebonyi_ikwo",
    ("Ebonyi", "Ezza South"): "ebonyi_ezza_south",
    ("Ebonyi", "Ohaukwu"): "ebonyi_ohaukwu",
    # Plateau
    ("Plateau", "Jos North"): "plateau_jos_north",
    ("Plateau", "Mangu"): "plateau_mangu",
    ("Plateau", "Shendam"): "plateau_shendam",
    ("Plateau", "Pankshin"): "plateau_pankshin"
}


def normalize_facility_type(raw_type: str, name: str):
    "Normalizes GRID3 facility_level_option and facility name into NPHCDA standard tiers."
    name_lower = name.lower()
    if "comprehensive" in name_lower or "model" in name_lower:
        return "Comprehensive Health Centre"

    if isinstance(raw_type, str):
        t_clean = raw_type.strip()
        if "Comprehensive" in t_clean:
            return "Comprehensive Health Centre"
        if "Primary Health Center" in t_clean or "Health Centre" in t_clean or "PHC" in name:
            return "Primary Health Centre"
        if "Primary Health Clinic" in t_clean or "Clinic" in t_clean:
            return "Primary Health Clinic"
        if "Health Post" in t_clean or "Dispensary" in name or "Post" in name:
            return "Health Post"

    # Default to Primary Health Centre for primary level
    return "Primary Health Centre"


class FacilityGenerator:
    "Ingests real facilities from GRID3 CSV dataset and enriches with calibrated public health attributes"

    _cached_df = None

    def __init__(self, grid3_csv_path: Optional[Path] = None, seed: int = 42):
        self.rng = random.Random(seed)
        self.lga_map = get_lga_indicators_map()

        # Locate GRID3 CSV
        if grid3_csv_path is None:
            here = Path(__file__).resolve().parent
            candidates = [
                here / "GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv",
                here.parent / "GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv",
                here / "data" / "raw" / "GRID3_NGA_health_facilities_v2_0_5806009649412052847.csv"
            ]
            self.grid3_csv_path = next((p for p in candidates if p.exists()), None)
        else:
            self.grid3_csv_path = Path(grid3_csv_path)

    def load_from_grid3_csv(self):
        "Loads and parses real facilities directly from the official GRID3 Nigeria CSV."
        if not self.grid3_csv_path or not self.grid3_csv_path.exists():
            raise FileNotFoundError(f"GRID3 CSV not found at {self.grid3_csv_path}")

        if FacilityGenerator._cached_df is None:
            print(f"Reading real health facilities from: {self.grid3_csv_path.name}")
            FacilityGenerator._cached_df = pd.read_csv(self.grid3_csv_path, low_memory=False)

        df = FacilityGenerator._cached_df

        facilities: List[FacilityRecord] = []
        target_states = set(lga.state for lga in self.lga_map.values())

        # Filter for our 6 focal states and public primary level facilities
        subset = df[
            (df["state"].isin(target_states))
            & (df["facility_level"] == "Primary")
            & (df["ownership"].isin(["Public", "Local Government", "State Government", "Unknown"]))
        ].copy()

        # Iterate over facilities and match to our 24 LGAs
        facility_idx_by_lga: Dict[str, int] = {}

        for _, row in subset.iterrows():
            state = str(row.get("state", "")).strip()
            lga_raw = str(row.get("lga", "")).strip()
            lookup_key = (state, lga_raw)

            if lookup_key not in LGA_NAME_TO_ID:
                continue

            lga_id = LGA_NAME_TO_ID[lookup_key]
            lga = self.lga_map.get(lga_id)
            if not lga:
                continue

            facility_name = str(row.get("facility_name", "")).strip()
            if not facility_name or facility_name.lower() == "nan":
                facility_name = f"{lga.lga_name} Primary Health Centre"

            ward = str(row.get("ward", "")).strip()
            if not ward or ward.lower() == "nan":
                ward = "Central Ward"

            lat = float(row.get("latitude", lga.centroid_lat))
            lon = float(row.get("longitude", lga.centroid_lon))

            # Sanity check lat/lon bounding box
            if math.isnan(lat) or math.isnan(lon) or lat == 0 or lon == 0:
                lat = lga.centroid_lat + self.rng.uniform(-0.02, 0.02)
                lon = lga.centroid_lon + self.rng.uniform(-0.02, 0.02)

            # Facility type
            raw_type = str(row.get("facility_level_option", ""))
            f_type = normalize_facility_type(raw_type, facility_name)

            # Facility ID from nhfr code or uid
            nhfr_code = str(row.get("nhfr_facility_code", "")).strip()
            raw_uid = row.get("nhfr_uid", "")
            if pd.notna(raw_uid) and str(raw_uid).strip() not in ["", "nan"]:
                try:
                    clean_uid = str(int(float(raw_uid)))
                except (ValueError, TypeError):
                    clean_uid = str(raw_uid).strip()
            else:
                clean_uid = ""

            idx = facility_idx_by_lga.get(lga_id, 0) + 1
            facility_idx_by_lga[lga_id] = idx

            if clean_uid and len(clean_uid) > 2:
                facility_id = f"{lga_id}_{clean_uid}"
            else:
                facility_id = f"{lga_id}_{f_type[:3].lower()}_{idx:02d}"

            # Rurality calculation
            if f_type in ["Health Post", "Primary Health Clinic"]:
                is_rural = self.rng.random() < max(0.40, lga.rurality_rate)
            elif f_type == "Comprehensive Health Centre":
                is_rural = self.rng.random() < (lga.rurality_rate * 0.30)
            else:
                is_rural = self.rng.random() < (lga.rurality_rate * 0.80)

            is_riverine = state == "Bayelsa"

            # Staffing & Resources (Correlated with type, state poverty, and rurality)
            if f_type == "Comprehensive Health Centre":
                catchment = int(self.rng.uniform(22000, 48000))
                if is_rural:
                    doctors = self.rng.choice([0, 1])
                    midwives = self.rng.randint(2, 4)
                    chews = self.rng.randint(5, 8)
                else:
                    doctors = self.rng.randint(1, 3)
                    midwives = self.rng.randint(4, 7)
                    chews = self.rng.randint(7, 12)
                total_staff = doctors + midwives + chews

                has_cold_chain = self.rng.random() < 0.95
                cold_chain_type = "Solar Direct Drive (SDD)" if self.rng.random() < 0.75 else "Electric Grid/Backup"
                has_solar = self.rng.random() < 0.85
                has_water = self.rng.random() < (0.90 if not is_riverine else 0.50)

                if is_riverine:
                    transport_diff = self.rng.uniform(0.40, 0.70)
                else:
                    transport_diff = self.rng.uniform(0.10, 0.35) if not is_rural else self.rng.uniform(0.30, 0.55)

            elif f_type == "Primary Health Centre":
                catchment = int(self.rng.uniform(10000, 22000))
                doctors = 0
                if is_rural:
                    midwives = self.rng.choice([0, 1, 2])
                    chews = self.rng.randint(2, 5)
                else:
                    midwives = self.rng.randint(2, 4)
                    chews = self.rng.randint(4, 7)
                total_staff = doctors + midwives + chews

                prob_cold = 0.55 if is_rural else 0.88
                if lga.poverty_headcount_mpi > 0.50:  # Extremely poor LGAs (Sokoto/Yobe baseline MPI > 0.50)
                    prob_cold *= 0.75
                has_cold_chain = self.rng.random() < prob_cold
                cold_chain_type = "Solar Direct Drive (SDD)" if has_cold_chain else "None (Passive carrier only)"

                has_solar = self.rng.random() < (0.45 if is_rural else 0.78)
                has_water = self.rng.random() < (0.50 if is_rural else 0.80)

                if is_riverine:
                    transport_diff = self.rng.uniform(0.55, 0.88)
                else:
                    transport_diff = self.rng.uniform(0.35, 0.70) if is_rural else self.rng.uniform(0.15, 0.35)

            elif f_type == "Primary Health Clinic":
                catchment = int(self.rng.uniform(4000, 10000))
                doctors = 0
                midwives = self.rng.choice([0, 1]) if not is_rural else 0
                chews = self.rng.randint(1, 3) if is_rural else self.rng.randint(2, 4)
                total_staff = doctors + midwives + chews

                prob_cold = 0.25 if is_rural else 0.50
                if lga.poverty_headcount_mpi > 0.50:  # Extremely poor LGAs (Sokoto/Yobe baseline MPI > 0.50)
                    prob_cold *= 0.65
                has_cold_chain = self.rng.random() < prob_cold
                cold_chain_type = "Solar Direct Drive (SDD)" if has_cold_chain else "None (Passive carrier only)"

                has_solar = self.rng.random() < 0.30
                has_water = self.rng.random() < 0.40

                if is_riverine:
                    transport_diff = self.rng.uniform(0.65, 0.92)
                else:
                    transport_diff = self.rng.uniform(0.40, 0.75) if is_rural else self.rng.uniform(0.20, 0.45)

            else:  # Health Post
                catchment = int(self.rng.uniform(1500, 4500))
                doctors = 0
                midwives = 0
                chews = self.rng.randint(1, 2)
                total_staff = chews

                prob_cold = 0.12 if is_rural else 0.25
                has_cold_chain = self.rng.random() < prob_cold
                cold_chain_type = "Solar Direct Drive (SDD)" if has_cold_chain else "None (Passive carrier only)"

                has_solar = self.rng.random() < 0.15
                has_water = self.rng.random() < 0.25

                if is_riverine:
                    transport_diff = self.rng.uniform(0.75, 0.96)
                else:
                    transport_diff = self.rng.uniform(0.55, 0.90) if is_rural else self.rng.uniform(0.30, 0.55)

            # Monthly targets (4.0% under-1, 4.8% pregnant women)
            monthly_under1 = max(5, int((catchment * 0.040) / 12))
            monthly_pregnant = max(6, int((catchment * 0.048) / 12))

            # GSM signal
            gsm_penalty = 0.35 if is_rural else 0.05
            if is_riverine:
                gsm_penalty += 0.15
            gsm_score = round(
                max(
                    0.05,
                    min(
                        1.0,
                        lga.telecom_coverage_rate - gsm_penalty + self.rng.uniform(-0.08, 0.08)
                    )
                ),
                2
            )

            # Baseline reporting probability
            staff_factor = min(1.0, total_staff / 6.0)
            base_reporting = (0.45 * staff_factor) + (0.35 * gsm_score) + (0.20 * (1.0 - transport_diff))
            base_reporting = round(max(0.12, min(0.96, base_reporting)), 3)

            rec = FacilityRecord(
                facility_id=facility_id,
                facility_name=facility_name,
                facility_type=f_type,
                lga_id=lga_id,
                lga_name=lga.lga_name,
                state=state,
                geopolitical_zone=lga.geopolitical_zone,
                ward=ward,
                latitude=round(lat, 5),
                longitude=round(lon, 5),
                is_rural=is_rural,
                catchment_population=catchment,
                monthly_under1_target=monthly_under1,
                monthly_pregnant_target=monthly_pregnant,
                total_staff=total_staff,
                nurses_midwives_count=midwives,
                chew_count=chews,
                doctors_count=doctors,
                has_cold_chain=has_cold_chain,
                cold_chain_type=cold_chain_type,
                has_solar_power=has_solar,
                has_borehole_water=has_water,
                transport_access_difficulty=round(transport_diff, 2),
                gsm_connectivity_score=gsm_score,
                baseline_reporting_prob=base_reporting,
                nhfr_facility_code=nhfr_code if nhfr_code and nhfr_code.lower() != "nan" else None,
                ownership=str(row.get("ownership", "Public"))
            )
            facilities.append(rec)

        print(f"Parsed {len(facilities)} real facilities from GRID3 CSV across 24 LGAs.")
        return facilities

    def generate_all_facilities(self):
        """Loads real facilities from GRID3 CSV if available."""
        if self.grid3_csv_path and self.grid3_csv_path.exists():
            return self.load_from_grid3_csv()
        raise FileNotFoundError("GRID3 CSV file not found!")

    def export_to_json(self, output_path: Path):
        """Generates and writes facilities to JSON."""
        facilities = self.generate_all_facilities()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        data = [asdict(f) for f in facilities]
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return facilities
