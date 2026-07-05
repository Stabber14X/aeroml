import numpy as np
import json
from scipy.special import comb

def bernstein(n, r, t):
    return comb(n, r) * (t ** r) * ((1 - t) ** (n - r))

def class_function(t, N1=0.5, N2=1.0):
    return (t ** N1) * ((1 - t) ** N2)

def calculate_coords(a_upper, a_lower, num_points=100):
    """Core math kernel - returns raw arrays"""
    beta = np.linspace(0, np.pi, num_points)
    x = 0.5 * (1 - np.cos(beta))
    
    n_u = len(a_upper) - 1
    C_u = class_function(x)
    S_u = np.zeros_like(x)
    for i in range(n_u + 1):
        S_u += a_upper[i] * bernstein(n_u, i, x)
    y_upper = C_u * S_u

    n_l = len(a_lower) - 1
    C_l = class_function(x)
    S_l = np.zeros_like(x)
    for i in range(n_l + 1):
        S_l += a_lower[i] * bernstein(n_l, i, x)
    y_lower = C_l * S_l 

    x_u_rev = x[::-1]
    y_u_rev = y_upper[::-1]
    x_l = x[1:]
    
    # CRITICAL FIX: Removed the minus sign. CST naturally outputs the correct negative magnitude.
    y_l = y_lower[1:] 
    
    full_x = np.concatenate([x_u_rev, x_l])
    full_y = np.concatenate([y_u_rev, y_l])
    
    return full_x, full_y

def generate_gcode(x, y, scale_mm, filename):
    """Generates 4-Axis CNC Hot-Wire Toolpaths"""
    lines = [
        f"; AeroML CNC Toolpath - {filename}",
        f"; Physical Chord Target: {scale_mm} mm",
        "; Machine: 4-Axis Hot Wire Foam Cutter",
        "G21 ; Set units to millimeters",
        "G90 ; Absolute positioning",
        "G28 ; Home all axes",
        "G0 Z5.0 F1500 ; Safely clear work area",
        f"G0 X{x[0]*scale_mm:.3f} Y{y[0]*scale_mm:.3f} F1500 ; Rapid to Trailing Edge Start",
        "G1 Z-5.0 F300 ; Plunge wire into block",
    ]
    
    # Trace the perimeter
    for xi, yi in zip(x, y):
        lines.append(f"G1 X{xi*scale_mm:.3f} Y{yi*scale_mm:.3f} F400")
        
    lines.extend([
        "G0 Z5.0 F1500 ; Lift wire out of block",
        "G28 X0 Y0 ; Return to home",
        "M30 ; End of program"
    ])
    return "\n".join(lines)

def generate_export_content(a_upper, a_lower, fmt="dat", filename="airfoil", scale_mm=1000.0):
    """Generates file content based on requested format."""
    x, y = calculate_coords(a_upper, a_lower)
    
    if fmt == "dat":
        # Selig Format
        output = [f"{filename}"]
        for xi, yi in zip(x, y):
            output.append(f"{xi:.6f}  {yi:.6f}")
        return "\n".join(output), "text/plain"
        
    elif fmt == "csv":
        # Excel/Pandas Format
        output = ["x,y"]
        for xi, yi in zip(x, y):
            output.append(f"{xi:.6f},{yi:.6f}")
        return "\n".join(output), "text/csv"
        
    elif fmt == "json":
        # Web Format
        data = [{"x": xi, "y": yi} for xi, yi in zip(x, y)]
        return json.dumps(data, indent=2), "application/json"
        
    elif fmt == "gcode":
        gcode = generate_gcode(x, y, scale_mm, filename)
        return gcode, "text/plain"
        
    else:
        raise ValueError("Unknown format")