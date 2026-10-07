from dataclasses import dataclass


@dataclass
class CommoditySpec:
    commodity_id: str
    name: str
    category: str
    requires_cold_chain: bool
    unit: str
    base_weekly_per_1k: float  # Base weekly consumption per 1,000 catchment pop
    seasonal_peak: str  # "rainy", "harmattan" (or "dry"), or "none"
    seasonal_multiplier: float  # Peak amplitude multiplier
    criticality_score: float  # 1.0 (standard) to 3.0 (life-critical zero-tolerance)
    description: str


ESSENTIAL_COMMODITIES: list[CommoditySpec] = [
    CommoditySpec(
        commodity_id="act_artemether_lumefantrine",
        name="Artemether-Lumefantrine 20/120mg",
        category="Antimalarial",
        requires_cold_chain=False,
        unit="blister packs",
        base_weekly_per_1k=12.5,
        seasonal_peak="rainy",
        seasonal_multiplier=1.85,  # Up to 85% surge in rainy season (July-October)
        criticality_score=2.8,
        description="First-line artemisinin-based combination therapy (ACT) for uncomplicated P. falciparum malaria.",
    ),
    CommoditySpec(
        commodity_id="amoxicillin_dt",
        name="Amoxicillin 250mg Dispersible Tablets",
        category="Antibiotic / IMCI",
        requires_cold_chain=False,
        unit="treatment packs (10 tabs)",
        base_weekly_per_1k=8.0,
        seasonal_peak="harmattan",
        seasonal_multiplier=1.40,  # Respiratory infections spike in dust/cold season (Nov-Feb)
        criticality_score=2.6,
        description="First-line IMCI treatment for childhood fast-breathing pneumonia in under-fives.",
    ),
    CommoditySpec(
        commodity_id="ors_zinc_copack",
        name="ORS + Zinc Co-pack",
        category="Diarrhoea Management",
        requires_cold_chain=False,
        unit="co-packs",
        base_weekly_per_1k=6.5,
        seasonal_peak="rainy",
        seasonal_multiplier=1.60,  # Spikes during heavy rain / flood / water contamination
        criticality_score=2.4,
        description="Standard zinc sulphate (20mg) and low-osmolarity oral rehydration salts for paediatric diarrhoea.",
    ),
    CommoditySpec(
        commodity_id="oxytocin_injection",
        name="Oxytocin Injection 10 IU/ml",
        category="Maternal Health",
        requires_cold_chain=True,
        unit="ampoules",
        base_weekly_per_1k=2.2,
        seasonal_peak="none",
        seasonal_multiplier=1.0,
        criticality_score=3.0,
        description="Life-saving uterotonic for active management of third stage of labour and PPH prevention. Requires 2-8°C cold chain.",
    ),
    CommoditySpec(
        commodity_id="penta_vaccine",
        name="Pentavalent Vaccine (DTP-HepB-Hib)",
        category="EPI Vaccine",
        requires_cold_chain=True,
        unit="doses",
        base_weekly_per_1k=5.0,
        seasonal_peak="none",
        seasonal_multiplier=1.0,
        criticality_score=3.0,
        description="Routine infant immunization administered at 6, 10, and 14 weeks. Absolute cold-chain dependence (2-8°C).",
    ),
    CommoditySpec(
        commodity_id="measles_vaccine",
        name="Measles Vaccine",
        category="EPI Vaccine",
        requires_cold_chain=True,
        unit="doses",
        base_weekly_per_1k=4.2,
        seasonal_peak="harmattan",
        seasonal_multiplier=1.50,  # Measles outbreaks peak in harmattan / dry season (Nov-March)
        criticality_score=2.9,
        description="Freeze-dried routine EPI vaccine administered at 9 months. Highly sensitive to heat exposure.",
    ),
    CommoditySpec(
        commodity_id="malaria_rdt",
        name="Rapid Diagnostic Test (RDT) for Malaria",
        category="Diagnostic",
        requires_cold_chain=False,
        unit="test cassettes",
        base_weekly_per_1k=15.0,
        seasonal_peak="rainy",
        seasonal_multiplier=1.80,
        criticality_score=2.5,
        description="Point-of-care antigen test required before prescribing antimalarials to prevent antimicrobial resistance.",
    ),
    CommoditySpec(
        commodity_id="clean_delivery_kits",
        name="Clean Delivery Mama Kit",
        category="Maternal & Child Health",
        requires_cold_chain=False,
        unit="kits",
        base_weekly_per_1k=2.0,
        seasonal_peak="none",
        seasonal_multiplier=1.0,
        criticality_score=2.5,
        description="Sterile delivery pack (cord clamp, sterile surgical blade, soap, mackintosh sheet, gauze) for safe childbirth.",
    ),
]


def get_commodities_map() -> dict[str, CommoditySpec]:
    return {c.commodity_id: c for c in ESSENTIAL_COMMODITIES}
