# backend/app/api/geometry.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from app.api.auth import get_current_user
from app.ml_engine.structural_skeleton import analyze_structural_properties, apply_control_surface

router = APIRouter()

class StructuralInput(BaseModel):
    cst_coefficients: List[float]
    spar_location_x: float = 0.33

class MorphInput(BaseModel):
    cst_coefficients: List[float]
    deflection_degrees: float
    hinge_x: float
    surface_type: str  # 'LEF' or 'TEF'

class StructuralOutput(BaseModel):
    max_thickness: float
    spar_height: float
    te_angle_deg: float
    cross_sectional_area: float

class MorphOutput(BaseModel):
    morphed_cst: List[float]
    fitting_error: float

@router.post("/analyze", response_model=StructuralOutput)
async def analyze_geometry(data: StructuralInput, user=Depends(get_current_user)):
    try:
        return analyze_structural_properties(data.cst_coefficients, data.spar_location_x)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Structural analysis failed: {str(e)}")

@router.post("/morph", response_model=MorphOutput)
async def morph_control_surface(data: MorphInput, user=Depends(get_current_user)):
    try:
        result = apply_control_surface(
            cst_coeffs=data.cst_coefficients,
            deflection_degrees=data.deflection_degrees,
            hinge_x=data.hinge_x,
            surface_type=data.surface_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geometry morphing failed: {str(e)}")