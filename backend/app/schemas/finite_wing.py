# backend/app/schemas/finite_wing.py
from pydantic import BaseModel
from typing import List, Optional

class FiniteWingInput(BaseModel):
    # Airfoil Geometry (CST)
    cst_upper: List[float]
    cst_lower: List[float]
    
    # Wing Planform
    span_m: float = 3.0       # Wingspan
    chord_root_m: float = 0.4 # Root chord
    taper_ratio: float = 0.6  # Tip chord / Root chord
    sweep_deg: float = 10.0   # Quarter-chord sweep
    twist_deg: float = 0.0    # Washout/Twist
    
    # Flight Conditions
    velocity_mps: float = 40.0
    alpha_deg: float = 5.0
    altitude_m: float = 0.0

class VLMOutput(BaseModel):
    CL: float
    CD_induced: float
    CM: float
    L_over_D: float
    span_efficiency: float  # Oswald e
    
    # Spanwise Distributions (for plotting)
    y_stations: List[float]
    cl_local: List[float]   # Local lift coefficient
    cl_load: List[float]    # Lift load (c_l * c)
    
class AcousticInput(BaseModel):
    # Aerodynamic inputs derived from DeepONet/VLM
    velocity_mps: float
    chord_m: float
    span_m: float
    delta_star_m: float     # Displacement thickness (from NeuralFoil)
    alpha_deg: float
    observer_distance_m: float = 1.0

class AcousticOutput(BaseModel):
    overall_spl_db: float   # Sound Pressure Level
    peak_frequency_hz: float
    spectrum_freq: List[float]
    spectrum_db: List[float]