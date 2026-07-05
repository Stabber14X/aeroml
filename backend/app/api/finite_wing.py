# backend/app/api/finite_wing.py
from fastapi import APIRouter, HTTPException, Depends
from app.api.auth import get_current_user
from app.models.user import User
from app.schemas.finite_wing import FiniteWingInput, VLMOutput, AcousticInput, AcousticOutput
from app.ml_engine.vlm_solver import run_vlm_simulation
from app.ml_engine.acoustics_solver import calculate_bpm_noise
import traceback

router = APIRouter()

@router.post("/vlm", response_model=VLMOutput)
async def solve_vlm(data: FiniteWingInput, current_user: User = Depends(get_current_user)):
    """
    Executes the 3D Vortex Lattice Method solver.
    """
    try:
        results = run_vlm_simulation(data)
        return results
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"VLM Solver Error: {str(e)}")

@router.post("/acoustics", response_model=AcousticOutput)
async def solve_acoustics(data: AcousticInput, current_user: User = Depends(get_current_user)):
    """
    Executes the Aero-Acoustic BPM solver.
    """
    try:
        results = calculate_bpm_noise(data)
        return results
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Acoustic Solver Error: {str(e)}")