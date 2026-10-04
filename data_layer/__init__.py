"""
PHC Pulse — Data Layer Package
Core data simulation, spatial network modeling, and risk triage feature engineering.
"""

from data_layer.real_indicators import NIGERIA_LGA_DATA, LGAContext, get_lga_indicators_map
from data_layer.commodities import ESSENTIAL_COMMODITIES, CommoditySpec
from data_layer.facility_generator import FacilityGenerator, FacilityRecord
from data_layer.simulation_engine import StockSimulationEngine, WeeklyCommodityEvent
from data_layer.network_builder import FacilityNetworkBuilder, FacilityEdge
from data_layer.feature_extractor import FacilityFeatureExtractor
from data_layer.run_pipeline import run_pipeline

__all__ = [
    "NIGERIA_LGA_DATA",
    "LGAContext",
    "get_lga_indicators_map",
    "ESSENTIAL_COMMODITIES",
    "CommoditySpec",
    "FacilityGenerator",
    "FacilityRecord",
    "StockSimulationEngine",
    "WeeklyCommodityEvent",
    "FacilityNetworkBuilder",
    "FacilityEdge",
    "FacilityFeatureExtractor",
    "run_pipeline"
]
