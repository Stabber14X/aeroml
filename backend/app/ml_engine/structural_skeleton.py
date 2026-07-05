# backend/app/ml_engine/structural_skeleton.py
import math
import numpy as np
from app.utils.cst_generation import calculate_coords
from app.utils.cst_fitting import fit_single_surface_advanced, cst_curve

def get_cst_y(weights, x_vals):
    n = len(weights) - 1
    y = np.zeros_like(x_vals)
    for i, w in enumerate(weights):
        bernstein = math.comb(n, i) * (x_vals**i) * ((1.0 - x_vals)**(n - i))
        y += w * bernstein
    return y

def analyze_structural_properties(cst_coeffs: list, spar_x: float = 0.33):
    upper = cst_coeffs[:8]
    lower = cst_coeffs[8:16]
    
    beta = np.linspace(0, np.pi, 200)
    x_cos = 0.5 * (1.0 - np.cos(beta))
    
    C = (x_cos**0.5) * (1.0 - x_cos)
    y_u = C * get_cst_y(upper, x_cos)
    y_l = C * get_cst_y(lower, x_cos)
    
    thickness = y_u - y_l
    max_thickness = np.max(thickness)
    spar_idx = np.argmin(np.abs(x_cos - spar_x))
    spar_height = thickness[spar_idx]
    
    te_dx = x_cos[-1] - x_cos[-2]
    te_dy_u = y_u[-1] - y_u[-2]
    te_dy_l = y_l[-1] - y_l[-2]
    te_angle_deg = math.degrees(math.atan2(-te_dy_u, -te_dx)) + math.degrees(math.atan2(te_dy_l, -te_dx))
    
    area = np.trapz(thickness, x_cos)
    
    return {
        "max_thickness": float(max_thickness),
        "spar_height": float(spar_height),
        "te_angle_deg": float(abs(te_angle_deg)),
        "cross_sectional_area": float(abs(area))
    }

def apply_control_surface(cst_coeffs: list, deflection_degrees: float, hinge_x: float, surface_type: str):
    """
    surface_type: 'TEF' (Trailing Edge Flap) or 'LEF' (Leading Edge Slat)
    """
    upper = cst_coeffs[:8]
    lower = cst_coeffs[8:16]
    
    full_x, full_y = calculate_coords(upper, lower, 200)
    mid = len(full_x) // 2
    x_up = full_x[:mid][::-1]
    y_up = full_y[:mid][::-1]
    x_lo = full_x[mid:]
    y_lo = full_y[mid:]
    
    h_idx = np.argmin(np.abs(x_lo - hinge_x))
    hinge_y = (y_up[h_idx] + y_lo[h_idx]) / 2.0
    
    # Standard aviation: Positive deflection means surface moves DOWN.
    # TEF (tail): Bend down requires clockwise rotation (negative angle)
    # LEF (nose): Bend down requires counter-clockwise rotation (positive angle)
    if surface_type == 'TEF':
        angle_rad = math.radians(-deflection_degrees)
    else:
        angle_rad = math.radians(deflection_degrees)
    
    new_x, new_y = [], []
    for x, y in zip(full_x, full_y):
        # Determine if the point is on the moving side of the hinge
        is_moving_part = (surface_type == 'TEF' and x >= hinge_x) or (surface_type == 'LEF' and x <= hinge_x)
        
        if is_moving_part:
            dx = x - hinge_x
            dy = y - hinge_y
            rx = dx * math.cos(angle_rad) - dy * math.sin(angle_rad)
            ry = dx * math.sin(angle_rad) + dy * math.cos(angle_rad)
            new_x.append(hinge_x + rx)
            new_y.append(hinge_y + ry)
        else:
            new_x.append(x)
            new_y.append(y)
            
    new_x = np.array(new_x)
    new_y = np.array(new_y)
    
    le_idx = np.argmin(new_x)
    ux, uy = new_x[:le_idx+1][::-1], new_y[:le_idx+1][::-1]
    lx, ly = new_x[le_idx:], new_y[le_idx:]
    
    u_uniq = np.unique(ux, return_index=True)[1]
    l_uniq = np.unique(lx, return_index=True)[1]
    
    up_cst = fit_single_surface_advanced(ux[u_uniq], uy[u_uniq], n_coeffs=8)
    lo_cst = fit_single_surface_advanced(lx[l_uniq], ly[l_uniq], n_coeffs=8)
    
    u_pred = cst_curve(ux[u_uniq], up_cst)
    l_pred = cst_curve(lx[l_uniq], lo_cst)
    
    mse_u = np.mean((uy[u_uniq] - u_pred)**2)
    mse_l = np.mean((ly[l_uniq] - l_pred)**2)
    rmse_total = float(np.sqrt(mse_u + mse_l))

    return {
        "morphed_cst": up_cst + lo_cst,
        "fitting_error": rmse_total
    }