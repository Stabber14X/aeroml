# backend/app/api/analysis.py
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import List
import math
import torch
import traceback

from app.api.auth import get_current_user
from app.ml_engine.structural_solver import AeroStructuralSolver
from app.ml_engine.mission_solver import MissionDynamicsSolver
from app.ml_engine.stochastic_solver import StochasticManufacturingAudit
from app.ml_engine.reality_sync import EmpiricalRealitySync
from app.ml_engine.loader import ai_brain 

router = APIRouter()

class StructuralRequest(BaseModel):
    cst_coefficients: List[float]
    cl: float; cd: float; cm: float; v_inf: float
    chord_m: float = 1.0; span_m: float = 10.0; material: str = "Al_7075_T6"
    skin_thickness_m: float = 0.002; load_factor: float = 1.0

class MissionRequest(BaseModel):
    cl_2d: float; cd_2d: float; aspect_ratio: float = 8.0
    mtow_kg: float = 5000.0; empty_weight_kg: float = 3000.0; fuel_weight_kg: float = 1500.0
    wing_area_m2: float = 20.0; thrust_N: float = 15000.0; sfc_kg_Ns: float = 1.5e-5
    altitude_m: float = 3000.0

class StochasticRequest(BaseModel):
    cst_coefficients: List[float]
    reynolds: float; alpha: float; mach: float
    noise_level_percent: float = 1.0
    iterations: int = 50

def get_atmosphere(altitude_m):
    T0, P0, L, R, g = 288.15, 101325.0, 0.0065, 287.05, 9.81
    if altitude_m < 11000:
        T = T0 - L * altitude_m
        P = P0 * (1 - L * altitude_m / T0) ** (g / (R * L))
        return P / (R * T)
    else:
        T = 216.65
        P = 22632 * math.exp(-g * (altitude_m - 11000) / (R * T))
        return P / (R * T)

@router.post("/structure")
async def analyze_structure(data: StructuralRequest):
    try:
        mid = len(data.cst_coefficients) // 2
        solver = AeroStructuralSolver(
            cst_upper=data.cst_coefficients[:mid], 
            cst_lower=data.cst_coefficients[mid:], 
            chord_m=data.chord_m, span_m=data.span_m, 
            material=data.material, skin_thickness_m=data.skin_thickness_m
        )
        rho = get_atmosphere(3000.0)
        return solver.calculate_wing_loads(data.cl, data.cd, data.cm, data.v_inf, rho, data.load_factor)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Structure Failed: {str(e)}")

@router.post("/mission")
async def analyze_mission(data: MissionRequest):
    try:
        solver = MissionDynamicsSolver(data.cl_2d, data.cd_2d, data.aspect_ratio)
        rho = get_atmosphere(data.altitude_m)
        return solver.evaluate_envelope(data.mtow_kg, data.empty_weight_kg, data.fuel_weight_kg, data.wing_area_m2, data.thrust_N, data.sfc_kg_Ns, rho)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Mission Failed: {str(e)}")

@router.post("/stochastic")
async def analyze_stochastic(data: StochasticRequest):
    try:
        # CRITICAL FIX: Properly format the 25-D Tensor for the NeuralFoil Core
        def predict_func(cst, re, alpha, mach):
            alpha_rad = math.radians(alpha)
            re_scaled = (math.log(re) - 12.5) / 3.5
            n_crit_scaled = 0.0 # (9.0 - 9.0)/4.5
            
            input_list = cst + [
                0.0, 0.0, # LE Weight, TE Thickness
                math.sin(2 * alpha_rad), math.cos(alpha_rad), 1.0 - (math.cos(alpha_rad)**2),
                re_scaled, n_crit_scaled, 1.0, 1.0
            ]
            
            t_in = torch.tensor([input_list], dtype=torch.float32).to(ai_brain.device)
            re_t = torch.tensor([[re]], dtype=torch.float32).to(ai_brain.device)
            
            with torch.no_grad():
                out = ai_brain.neuralfoil(t_in, re_t)
                scalars = out["scalars"][0].cpu().numpy()
            
            cl, cd, cm = scalars[1], scalars[2], scalars[3]
            
            # Compressibility correction
            if 0.0 < mach < 1.0:
                beta = max(math.sqrt(1.0 - mach**2), 0.1)
                cl /= beta
                cm /= beta
                
            return {'cl': float(cl), 'cd': float(cd), 'cm': float(cm)}

        solver = StochasticManufacturingAudit(data.cst_coefficients, predict_func)
        return solver.run_lhs_monte_carlo(data.reynolds, data.alpha, data.mach, data.noise_level_percent, data.iterations)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Stochastic Audit Failed: {str(e)}")

@router.post("/reality-sync")
async def analyze_reality_sync(file: UploadFile = File(...), simulated_cd: float = Form(...), simulated_cl: float = Form(...), wing_area: float = Form(...), mtow_kg: float = Form(...)):
    try:
        csv_string = (await file.read()).decode('utf-8')
        return EmpiricalRealitySync.process_flight_log(csv_string, simulated_cd, simulated_cl, wing_area, mtow_kg)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Reality Sync Failed: {str(e)}")