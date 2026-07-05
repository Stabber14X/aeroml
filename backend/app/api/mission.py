# backend/app/api/mission.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from app.api.auth import get_current_user
from app.ml_engine.aero_physics import calculate_flight_envelope, calculate_critical_mach

router = APIRouter()

class MissionInput(BaseModel):
    altitude_m: float
    velocity_mps: float
    chord_m: float

class MachAnalysisInput(BaseModel):
    cp_min: float  # The most negative Cp value (suction peak) on the airfoil

class MissionOutput(BaseModel):
    reynolds: float
    mach: float
    dynamic_pressure_pa: float
    atmosphere: Dict[str, float]

class MachOutput(BaseModel):
    m_crit: float
    m_dd: float

@router.post("/envelope", response_model=MissionOutput)
async def get_flight_envelope(data: MissionInput, user=Depends(get_current_user)):
    """
    Calculates atmospheric properties and dimensionless parameters (Re, Mach)
    based on real-world mission profiles.
    """
    try:
        envelope = calculate_flight_envelope(
            altitude_m=data.altitude_m,
            velocity_mps=data.velocity_mps,
            chord_m=data.chord_m
        )
        return envelope
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Atmospheric calculation failed: {str(e)}")

@router.post("/transonic", response_model=MachOutput)
async def analyze_transonic_limits(data: MachAnalysisInput, user=Depends(get_current_user)):
    """
    Calculates Critical Mach (M_crit) and Drag Divergence Mach (M_dd) 
    based on the airfoil's minimum pressure coefficient.
    """
    try:
        m_crit, m_dd = calculate_critical_mach(data.cp_min)
        return {
            "m_crit": m_crit,
            "m_dd": m_dd
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transonic analysis failed: {str(e)}")