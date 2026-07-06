# backend/app/api/predict.py
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import torch
import numpy as np
import math
import time

from app.ml_engine.loader import ai_brain
from app.ml_engine.physics_utils import process_aerodynamic_fields
from app.ml_engine.ensemble_engine import ensemble_core
from app.ml_engine.physics_constraints import (
    PhysicsConstraintLayer,
    apply_physics_to_neuralfoil_output,
    compute_physics_confidence,
    validate_drag_polar
)
from app.api.auth import get_current_user

router = APIRouter()

# Initialize physics constraint layer
physics_layer = PhysicsConstraintLayer(enable_corrections=True, verbose=False)


# ============================================================================
# PYDANTIC SCHEMAS
# ============================================================================

class PredictionInput(BaseModel):
    """Input schema for aerodynamic predictions."""
    cst_coefficients: List[float]
    reynolds: float
    alpha: float
    mach: float = 0.0
    n_crit: float = 9.0        # Freestream turbulence (9.0 = standard wind tunnel)
    xtr_upper: float = 1.0     # Forced transition location Upper (1.0 = natural)
    xtr_lower: float = 1.0     # Forced transition location Lower


class BoundaryLayerArray(BaseModel):
    """Boundary layer profile data."""
    x: List[float]
    theta: List[float]
    H: List[float]
    ue_vinf: List[float]
    cf: List[float]
    separated: List[bool]


class SovereignOutput(BaseModel):
    """Output schema with physics validation."""
    cl: float
    cd: float
    cm: float
    analysis_confidence: float
    physics_confidence: float
    physics_violations: Optional[List[str]] = None
    top_xtr: float
    bot_xtr: float
    source: str
    is_ensemble: bool = False
    upper_bl: Optional[BoundaryLayerArray] = None
    lower_bl: Optional[BoundaryLayerArray] = None


class AdvancedFieldOutput(BaseModel):
    """Field output schema."""
    x_grid: List[float]
    y_grid: List[float]
    u_values: List[float]
    v_values: List[float]
    cp_values: List[float]
    nut_values: List[float]
    min_cp: float
    max_cp: float
    diagnostics: Dict[str, Any]


class PhysicsValidationOutput(BaseModel):
    """Physics validation output."""
    is_physical: bool
    violations: List[Dict[str, Any]]
    corrected_values: Dict[str, float]
    confidence_score: float


# ============================================================================
# PHYSICS UTILITIES
# ============================================================================

def calculate_skin_friction(theta_arr, H_arr, ue_vinf_arr, reynolds):
    """
    Calculates C_f using the Ludwieg-Tillmann empirical relation.
    Physics-based skin friction calculation.
    """
    cf_arr = []
    sep_arr = []
    for theta, H, ue in zip(theta_arr, H_arr, ue_vinf_arr):
        # Local momentum Reynolds number
        re_theta = max(abs(ue) * reynolds * theta, 1.0)
        # Ludwieg-Tillmann turbulent skin friction
        cf = 0.246 * math.pow(10.0, -0.678 * H) * math.pow(re_theta, -0.268)
        cf_arr.append(float(cf))
        sep_arr.append(bool(H > 2.8))  # H > 2.8 strongly indicates flow separation
    return cf_arr, sep_arr


def apply_prandtl_glauert(cl: float, cm: float, mach: float) -> tuple:
    """
    Apply Prandtl-Glauert compressibility correction.
    Physics-based correction for subsonic compressible flow.
    """
    if 0.0 < mach < 0.7:
        beta = math.sqrt(1.0 - mach ** 2)
        beta = max(beta, 0.1)
        cl = cl / beta
        cm = cm / beta
    elif mach >= 0.7:
        # Karman-Tsien correction for transonic flow
        beta = math.sqrt(1.0 - mach ** 2)
        beta = max(beta, 0.1)
        cl = cl / (beta + (cl * mach ** 2) / (2 * (1 + beta)))
        cm = cm / (beta + (cm * mach ** 2) / (2 * (1 + beta)))
    return cl, cm


def enforce_physical_bounds(cl: float, cd: float, cm: float) -> tuple:
    """
    Enforce physical bounds on aerodynamic coefficients.
    """
    # Lift coefficient bounds (typical for airfoils)
    cl = max(-2.5, min(2.5, cl))
    
    # Drag coefficient must be positive
    cd = max(1e-8, cd)
    
    # Pitching moment bounds (stability requirement typically negative)
    cm = max(-0.5, min(0.3, cm))
    
    return cl, cd, cm


# ============================================================================
# SOVEREIGN INFERENCE ENDPOINT - WITH BOTH SLASH AND NO-SLASH SUPPORT
# ============================================================================

# --- MAIN ROUTE WITH TRAILING SLASH ---
@router.post("/", response_model=SovereignOutput)
async def predict_scalars(
    data: PredictionInput,
    use_ensemble: bool = Query(False, description="Use 8-model ensemble for higher accuracy"),
    user=Depends(get_current_user)
):
    """
    Executes the Native PyTorch NeuralFoil engine with physics validation.
    Switches between Single-Core xxxlarge (Default) and 8-Model Bayesian Ensemble.
    Physics constraints are applied to all outputs for physical consistency.
    """
    return await _predict_scalars_impl(data, use_ensemble, user)


# --- ROUTE WITHOUT TRAILING SLASH (Handles POST /predict) ---
@router.post("", response_model=SovereignOutput)
async def predict_scalars_no_slash(
    data: PredictionInput,
    use_ensemble: bool = Query(False, description="Use 8-model ensemble for higher accuracy"),
    user=Depends(get_current_user)
):
    """
    Same as predict_scalars but handles requests without trailing slash.
    Prevents FastAPI from returning 307 redirect.
    """
    return await _predict_scalars_impl(data, use_ensemble, user)


# --- SHARED IMPLEMENTATION ---
async def _predict_scalars_impl(data: PredictionInput, use_ensemble: bool, user):
    """
    Core prediction implementation shared by both routes.
    """
    start_time = time.time()
    
    ai_brain.load_artifacts()
    
    if getattr(ai_brain, "neuralfoil", None) is None:
        raise HTTPException(503, "Sovereign NeuralFoil Core not loaded.")

    try:
        # --- PATH A: MULTI-MODEL ENSEMBLE CONSENSUS ---
        if use_ensemble:
            ensemble_res = ensemble_core.get_ensemble_prediction(
                data.cst_coefficients, data.reynolds, data.alpha
            )
            
            # Apply compressibility correction
            cl, cm = apply_prandtl_glauert(ensemble_res["cl"], ensemble_res["cm"], data.mach)
            cd = ensemble_res["cd"]
            
            # Enforce physical bounds
            cl, cd, cm = enforce_physical_bounds(cl, cd, cm)
            
            # Create result dict for physics validation
            result = {
                "cl": cl,
                "cd": cd,
                "cm": cm,
                "top_xtr": 1.0,
                "bot_xtr": 1.0
            }
            
            # Apply physics validation layer
            validated = physics_layer.validate_prediction(
                result,
                alpha_deg=data.alpha,
                mach=data.mach
            )
            
            # Compute physics confidence
            physics_conf = compute_physics_confidence(validated)
            
            # Combine AI confidence with physics confidence
            combined_confidence = ensemble_res["confidence"] * physics_conf["score"]
            
            return {
                "cl": validated["cl"],
                "cd": validated["cd"],
                "cm": validated["cm"],
                "analysis_confidence": round(combined_confidence, 4),
                "physics_confidence": round(physics_conf["score"], 4),
                "physics_violations": physics_conf["penalties"] if physics_conf["penalties"] else None,
                "top_xtr": validated.get("top_xtr", 1.0),
                "bot_xtr": validated.get("bot_xtr", 1.0),
                "source": f"Sovereign Ensemble ({ensemble_res['models_polled']} Models Polled + Physics)",
                "is_ensemble": True,
                "upper_bl": None,
                "lower_bl": None
            }

        # --- PATH B: ORIGINAL SOVEREIGN SINGLE-CORE (xxxlarge) ---
        # 1. Extract 16-parameter CST and pad to 18
        upper = data.cst_coefficients[:8]
        lower = data.cst_coefficients[8:16]
        le_weight = 0.0
        te_thick = 0.0
        
        # 2. Mathematical Normalization matching NeuralFoil's training distribution
        alpha_rad = math.radians(data.alpha)
        sin_2a = math.sin(2 * alpha_rad)
        cos_a = math.cos(alpha_rad)
        one_m_cos2_a = 1.0 - (cos_a ** 2)
        
        re_scaled = (math.log(data.reynolds) - 12.5) / 3.5
        n_crit_scaled = (data.n_crit - 9.0) / 4.5
        
        # 3. Construct the exact 25-Dimensional Latent Vector
        input_list = upper + lower + [
            le_weight,
            te_thick * 50.0,
            sin_2a,
            cos_a,
            one_m_cos2_a,
            re_scaled,
            n_crit_scaled,
            data.xtr_upper,
            data.xtr_lower
        ]
        
        tensor_in = torch.tensor([input_list], dtype=torch.float32).to(ai_brain.device)
        reynolds_tensor = torch.tensor([[data.reynolds]], dtype=torch.float32).to(ai_brain.device)
        
        # 4. NeuralFoil Inference (Symmetric Pass)
        with torch.no_grad():
            outputs = ai_brain.neuralfoil(tensor_in, reynolds_tensor)
            
        scalars = outputs["scalars"][0].cpu().numpy()
        conf, cl, cd, cm, top_xtr, bot_xtr = scalars
        
        # 5. Apply Prandtl-Glauert Compressibility Correction
        cl, cm = apply_prandtl_glauert(cl, cm, data.mach)
        
        # 6. Enforce physical bounds
        cl, cd, cm = enforce_physical_bounds(cl, cd, cm)
        
        # 7. Create result dict for physics validation
        raw_result = {
            "cl": float(cl),
            "cd": float(cd),
            "cm": float(cm),
            "top_xtr": float(top_xtr),
            "bot_xtr": float(bot_xtr)
        }
        
        # 8. Apply comprehensive physics validation
        validated = physics_layer.validate_prediction(
            raw_result,
            alpha_deg=data.alpha,
            mach=data.mach
        )
        
        # 9. Compute physics-based confidence
        physics_conf = compute_physics_confidence(validated)
        
        # 10. Combine AI confidence with physics confidence
        # Physics violations reduce the effective confidence
        ai_conf = float(conf)
        combined_confidence = ai_conf * physics_conf["score"]
        
        # 11. Extract Boundary Layer Tensors with physics validation
        u_theta = outputs["upper_bl"]["theta"][0].cpu().numpy()
        u_H = outputs["upper_bl"]["H"][0].cpu().numpy()
        u_ue = outputs["upper_bl"]["ue_vinf"][0].cpu().numpy()
        
        l_theta = outputs["lower_bl"]["theta"][0].cpu().numpy()
        l_H = outputs["lower_bl"]["H"][0].cpu().numpy()
        l_ue = outputs["lower_bl"]["ue_vinf"][0].cpu().numpy()
        
        # Apply physics validation to boundary layer parameters
        for i in range(len(u_H)):
            if u_H[i] < 1.2:
                u_H[i] = 1.2
            elif u_H[i] > 4.0:
                u_H[i] = 4.0
        
        for i in range(len(l_H)):
            if l_H[i] < 1.2:
                l_H[i] = 1.2
            elif l_H[i] > 4.0:
                l_H[i] = 4.0
        
        # 12. Calculate Skin Friction (Cf) and Separation Diagnostics
        u_cf, u_sep = calculate_skin_friction(u_theta, u_H, u_ue, data.reynolds)
        l_cf, l_sep = calculate_skin_friction(l_theta, l_H, l_ue, data.reynolds)
        
        # Generate X-coordinates for the 32 BL points
        s = np.linspace(0, 1, 33)
        bl_x_points = ((s[1:] + s[:-1]) / 2).tolist()
        
        # 13. Validate transition locations
        top_xtr_validated = physics_layer.enforce_transition_location(validated.get("top_xtr", 1.0))
        bot_xtr_validated = physics_layer.enforce_transition_location(validated.get("bot_xtr", 1.0))

        return {
            "cl": validated["cl"],
            "cd": validated["cd"],
            "cm": validated["cm"],
            "analysis_confidence": round(combined_confidence, 4),
            "physics_confidence": round(physics_conf["score"], 4),
            "physics_violations": physics_conf["penalties"] if physics_conf["penalties"] else None,
            "top_xtr": top_xtr_validated,
            "bot_xtr": bot_xtr_validated,
            "source": "Sovereign Core (xxxlarge) + Physics Validation",
            "is_ensemble": False,
            "upper_bl": {
                "x": bl_x_points,
                "theta": u_theta.tolist(),
                "H": u_H.tolist(),
                "ue_vinf": u_ue.tolist(),
                "cf": u_cf,
                "separated": u_sep
            },
            "lower_bl": {
                "x": bl_x_points,
                "theta": l_theta.tolist(),
                "H": l_H.tolist(),
                "ue_vinf": l_ue.tolist(),
                "cf": l_cf,
                "separated": l_sep
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Sovereign Core Execution Failed: {str(e)}")


# ============================================================================
# CONTINUOUS VECTOR FIELD ENDPOINT
# ============================================================================

@router.post("/field", response_model=AdvancedFieldOutput)
async def predict_advanced_field(data: PredictionInput, user=Depends(get_current_user)):
    """
    Generates continuous vector fields using DeepONet with physics validation.
    Returns velocity, pressure, and turbulence fields with physics-based diagnostics.
    """
    ai_brain.load_artifacts()
    
    # Check if DeepONet is available
    if getattr(ai_brain, "deeponet", None) is None:
        raise HTTPException(
            status_code=503, 
            detail="DeepONet model not loaded. Please check trained_models/deeponet_v7.pth exists."
        )
    
    # Check if field scalers are available
    if getattr(ai_brain, "field_mean", None) is None or getattr(ai_brain, "field_std", None) is None:
        raise HTTPException(
            status_code=503,
            detail="Field scalers not loaded. Please check trained_models/field_scaler.pt exists."
        )

    try:
        # Generate High-Res Query Grid
        RES_X, RES_Y = 150, 100
        x_dom = np.linspace(-0.5, 1.5, RES_X)
        y_dom = np.linspace(-0.5, 0.5, RES_Y)
        X, Y = np.meshgrid(x_dom, y_dom)
        flat_x = X.ravel()
        flat_y = Y.ravel()

        # Tensor Preparation
        branch_in = data.cst_coefficients + [data.alpha, data.reynolds / 1e6]
        branch_tensor = torch.tensor([branch_in], dtype=torch.float32).to(ai_brain.device)
        
        trunk_tensor = torch.tensor(np.stack([flat_x, flat_y], axis=1), dtype=torch.float32).to(ai_brain.device)
        trunk_tensor = trunk_tensor.unsqueeze(0)

        # Inference
        with torch.no_grad():
            out_scaled = ai_brain.deeponet(branch_tensor, trunk_tensor)
            out_scaled = out_scaled.squeeze(0)
            
            # Inverse Scaling with safe fallback
            field_std = ai_brain.field_std.to(ai_brain.device)
            field_mean = ai_brain.field_mean.to(ai_brain.device)
            out_real = out_scaled * field_std + field_mean
            out_real = out_real.cpu().numpy()

        ux_vals = out_real[:, 0]
        uy_vals = out_real[:, 1]
        p_vals = out_real[:, 2]
        nut_vals = np.maximum(out_real[:, 3], 0)  # Enforce non-negative turbulence

        # Apply physics-based Cp bounds
        for i in range(len(p_vals)):
            p_vals[i] = physics_layer.enforce_cp_bounds(p_vals[i], data.mach)

        # Execute Advanced Diagnostics Module
        fields_dict = {'p': p_vals, 'ux': ux_vals, 'uy': uy_vals, 'nut': nut_vals}
        diagnostics = process_aerodynamic_fields(flat_x, flat_y, fields_dict)
        
        # Add physics validation to diagnostics
        diagnostics["physics_validated"] = True
        diagnostics["mach_regime"] = "subsonic" if data.mach < 0.7 else "transonic" if data.mach < 1.0 else "supersonic"

        return {
            "x_grid": flat_x.tolist(),
            "y_grid": flat_y.tolist(),
            "u_values": ux_vals.tolist(),
            "v_values": uy_vals.tolist(),
            "cp_values": p_vals.tolist(),
            "nut_values": nut_vals.tolist(),
            "min_cp": float(np.min(p_vals)),
            "max_cp": float(np.max(p_vals)),
            "diagnostics": diagnostics
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Field Generation Failed: {str(e)}")


# ============================================================================
# PHYSICS VALIDATION ENDPOINT
# ============================================================================

@router.post("/validate", response_model=PhysicsValidationOutput)
async def validate_prediction(
    data: PredictionInput,
    user=Depends(get_current_user)
):
    """
    Validates a prediction against physical laws without returning the prediction.
    Useful for debugging and quality assurance.
    """
    try:
        # First get the prediction
        upper = data.cst_coefficients[:8]
        lower = data.cst_coefficients[8:16]
        
        alpha_rad = math.radians(data.alpha)
        sin_2a = math.sin(2 * alpha_rad)
        cos_a = math.cos(alpha_rad)
        one_m_cos2_a = 1.0 - (cos_a ** 2)
        
        re_scaled = (math.log(data.reynolds) - 12.5) / 3.5
        n_crit_scaled = (data.n_crit - 9.0) / 4.5
        
        input_list = upper + lower + [
            0.0, 0.0, sin_2a, cos_a, one_m_cos2_a,
            re_scaled, n_crit_scaled, data.xtr_upper, data.xtr_lower
        ]
        
        tensor_in = torch.tensor([input_list], dtype=torch.float32).to(ai_brain.device)
        reynolds_tensor = torch.tensor([[data.reynolds]], dtype=torch.float32).to(ai_brain.device)
        
        with torch.no_grad():
            outputs = ai_brain.neuralfoil(tensor_in, reynolds_tensor)
        
        scalars = outputs["scalars"][0].cpu().numpy()
        cl, cd, cm = scalars[1], scalars[2], scalars[3]
        
        # Apply compressibility correction
        if 0.0 < data.mach < 1.0:
            beta = max(math.sqrt(1.0 - data.mach ** 2), 0.1)
            cl = cl / beta
            cm = cm / beta
        
        # Validate
        result = {"cl": float(cl), "cd": float(cd), "cm": float(cm)}
        validated = physics_layer.validate_prediction(result, data.alpha, data.mach)
        
        # Get violations
        violations = physics_layer.get_violations()
        
        return {
            "is_physical": len(violations) == 0,
            "violations": violations,
            "corrected_values": {
                "cl": validated["cl"],
                "cd": validated["cd"],
                "cm": validated["cm"]
            },
            "confidence_score": compute_physics_confidence(validated)["score"]
        }
        
    except Exception as e:
        raise HTTPException(500, f"Validation failed: {str(e)}")


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def health_check():
    """Check if the prediction service is healthy."""
    ai_brain.load_artifacts()
    return {
        "status": "healthy",
        "physics_enabled": True,
        "models_loaded": {
            "neuralfoil": ai_brain.neuralfoil is not None,
            "deeponet": ai_brain.deeponet is not None,
            "graphsage": ai_brain.graphsage is not None
        },
        "scaler_loaded": ai_brain.field_scaler is not None,
        "device": str(ai_brain.device)
    }


# ============================================================================
# BATCH PREDICTION ENDPOINT
# ============================================================================

@router.post("/batch")
async def predict_batch(
    requests: List[PredictionInput],
    user=Depends(get_current_user)
):
    """
    Batch prediction for optimization algorithms.
    Returns physics-validated predictions for multiple inputs efficiently.
    """
    if len(requests) > 100:
        raise HTTPException(400, "Maximum batch size is 100")
    
    results = []
    
    for req in requests:
        try:
            # Process each request individually with physics validation
            upper = req.cst_coefficients[:8]
            lower = req.cst_coefficients[8:16]
            
            alpha_rad = math.radians(req.alpha)
            sin_2a = math.sin(2 * alpha_rad)
            cos_a = math.cos(alpha_rad)
            one_m_cos2_a = 1.0 - (cos_a ** 2)
            
            re_scaled = (math.log(req.reynolds) - 12.5) / 3.5
            n_crit_scaled = (req.n_crit - 9.0) / 4.5
            
            input_list = upper + lower + [
                0.0, 0.0, sin_2a, cos_a, one_m_cos2_a,
                re_scaled, n_crit_scaled, req.xtr_upper, req.xtr_lower
            ]
            
            tensor_in = torch.tensor([input_list], dtype=torch.float32).to(ai_brain.device)
            reynolds_tensor = torch.tensor([[req.reynolds]], dtype=torch.float32).to(ai_brain.device)
            
            with torch.no_grad():
                outputs = ai_brain.neuralfoil(tensor_in, reynolds_tensor)
            
            scalars = outputs["scalars"][0].cpu().numpy()
            conf, cl, cd, cm = scalars[0], scalars[1], scalars[2], scalars[3]
            
            # Apply compressibility correction
            if 0.0 < req.mach < 1.0:
                beta = max(math.sqrt(1.0 - req.mach ** 2), 0.1)
                cl = cl / beta
                cm = cm / beta
            
            # Validate physics
            result = {"cl": float(cl), "cd": float(cd), "cm": float(cm)}
            validated = physics_layer.validate_prediction(result, req.alpha, req.mach)
            
            results.append({
                "cl": validated["cl"],
                "cd": validated["cd"],
                "cm": validated["cm"],
                "confidence": float(conf),
                "physics_valid": len(physics_layer.get_violations()) == 0
            })
            
            physics_layer.clear_violations()
            
        except Exception as e:
            results.append({
                "error": str(e),
                "cl": 0.0,
                "cd": 0.0,
                "cm": 0.0,
                "confidence": 0.0,
                "physics_valid": False
            })
    
    return {
        "batch_size": len(requests),
        "results": results
    }