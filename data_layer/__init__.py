"""
PHC Pulse - Data Layer Package
Core data simulation, spatial network modeling, and risk triage feature engineering.
"""

try:
    from data_layer.commodities import ESSENTIAL_COMMODITIES, CommoditySpec
    from data_layer.facility_generator import FacilityGenerator, FacilityRecord
    from data_layer.feature_extractor import FacilityFeatureExtractor
    from data_layer.network_builder import FacilityEdge, FacilityNetworkBuilder
    from data_layer.real_indicators import NIGERIA_LGA_DATA, LGAContext, get_lga_indicators_map
    from data_layer.risk_engine import FacilityRiskResult, RiskEngine, run_risk_engine
    from data_layer.run_pipeline import run_pipeline
    from data_layer.simulation_engine import StockSimulationEngine, WeeklyCommodityEvent
except ImportError:
    from .commodities import ESSENTIAL_COMMODITIES, CommoditySpec
    from .facility_generator import FacilityGenerator, FacilityRecord
    from .feature_extractor import FacilityFeatureExtractor
    from .network_builder import FacilityEdge, FacilityNetworkBuilder
    from .real_indicators import NIGERIA_LGA_DATA, LGAContext, get_lga_indicators_map
    from .risk_engine import FacilityRiskResult, RiskEngine, run_risk_engine
    from .run_pipeline import run_pipeline
    from .simulation_engine import StockSimulationEngine, WeeklyCommodityEvent

__all__ = [
    "ESSENTIAL_COMMODITIES",
    "NIGERIA_LGA_DATA",
    "CommoditySpec",
    "FacilityEdge",
    "FacilityFeatureExtractor",
    "FacilityGenerator",
    "FacilityNetworkBuilder",
    "FacilityRecord",
    "FacilityRiskResult",
    "LGAContext",
    "RiskEngine",
    "StockSimulationEngine",
    "WeeklyCommodityEvent",
    "get_lga_indicators_map",
    "run_pipeline",
    "run_risk_engine",
]
