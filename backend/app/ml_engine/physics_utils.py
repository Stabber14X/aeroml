import numpy as np

def analyze_suction_peak(x_grid, y_grid, p_values):
    """
    Finds the Suction Peak (lowest pressure) on the upper surface.
    Critical for predicting Mach shockwaves and structural stress.
    """
    # Filter for upper surface (roughly y > 0 and x between 0 and 1)
    mask = (y_grid > 0) & (x_grid >= 0) & (x_grid <= 1)
    if not np.any(mask):
        return {"value": 0, "x": 0, "y": 0}
        
    upper_p = p_values[mask]
    upper_x = x_grid[mask]
    upper_y = y_grid[mask]
    
    min_idx = np.argmin(upper_p)
    return {
        "value": float(upper_p[min_idx]),
        "x": float(upper_x[min_idx]),
        "y": float(upper_y[min_idx])
    }

def detect_flow_separation(x_grid, y_grid, ux_values):
    """
    Detects Stall / Separation Points.
    Looks for the point where air velocity reverses (Ux < 0) near the upper surface.
    """
    # Look near the upper surface boundary layer (y slightly > 0)
    mask = (y_grid > 0.01) & (y_grid < 0.1) & (x_grid > 0.1) & (x_grid <= 1.0)
    if not np.any(mask):
        return {"separated": False, "x_sep": None}
        
    surf_ux = ux_values[mask]
    surf_x = x_grid[mask]
    
    # Sort by X coordinate
    sort_idx = np.argsort(surf_x)
    surf_ux = surf_ux[sort_idx]
    surf_x = surf_x[sort_idx]
    
    # Find where Ux drops below 0 (flow reversal)
    for i in range(len(surf_ux)):
        if surf_ux[i] < -0.05:  # Threshold for reversal noise
            return {"separated": True, "x_sep": float(surf_x[i])}
            
    return {"separated": False, "x_sep": None}

def calculate_wake_deficit(x_grid, y_grid, ux_values, freestream_u=1.0):
    """
    Analyzes the 'Shadow' behind the wing to calculate energy loss.
    Samples the vertical velocity profile at x = 1.2 (behind the trailing edge).
    """
    # Tolerance for finding points near x = 1.2
    mask = np.abs(x_grid - 1.2) < 0.05
    if not np.any(mask):
        return {"max_deficit": 0, "wake_width": 0}
        
    wake_y = y_grid[mask]
    wake_ux = ux_values[mask]
    
    max_deficit = freestream_u - np.min(wake_ux)
    
    # Estimate wake width (distance between points where velocity drops by 10%)
    threshold = freestream_u * 0.9
    in_wake = wake_ux < threshold
    if np.any(in_wake):
        wake_edges = wake_y[in_wake]
        wake_width = np.max(wake_edges) - np.min(wake_edges)
    else:
        wake_width = 0
        
    return {
        "max_deficit": float(max_deficit),
        "wake_width": float(wake_width)
    }

def process_aerodynamic_fields(x_grid, y_grid, fields, freestream_u=1.0):
    """
    Master function to process all advanced diagnostics from raw AI outputs.
    fields: dict containing 'p', 'ux', 'uy', 'nut'
    """
    diagnostics = {}
    
    diagnostics['suction_peak'] = analyze_suction_peak(x_grid, y_grid, fields['p'])
    diagnostics['separation'] = detect_flow_separation(x_grid, y_grid, fields['ux'])
    diagnostics['wake'] = calculate_wake_deficit(x_grid, y_grid, fields['ux'], freestream_u)
    
    # Calculate Max Turbulence Intensity
    diagnostics['max_turbulence'] = float(np.max(fields['nut']))
    
    return diagnostics