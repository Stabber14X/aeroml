# backend/app/ml_engine/core/kulfan.py
import numpy as np
import math

def get_kulfan_coordinates(upper_weights, lower_weights, le_weight=0.0, te_thickness=0.0, n_points=100):
    """
    Authentic AeroSandbox Kulfan (CST) formulation.
    Generates x, y coordinates from the 18-parameter latent space.
    """
    # Cosine spacing for high resolution at leading/trailing edges
    beta = np.linspace(0, np.pi, n_points)
    x = 0.5 * (1.0 - np.cos(beta))
    
    # Class function C(x) for airfoils (N1=0.5, N2=1.0)
    C = (x ** 0.5) * (1.0 - x)
    
    # Shape function S(x)
    n_order = len(upper_weights) - 1
    
    def shape_function(weights, x_vals):
        S = np.zeros_like(x_vals)
        for i, w in enumerate(weights):
            bernstein = math.comb(n_order, i) * (x_vals ** i) * ((1.0 - x_vals) ** (n_order - i))
            S += w * bernstein
        return S

    # Calculate Shape Functions
    S_upper = shape_function(upper_weights, x)
    S_lower = shape_function(lower_weights, x)
    
    # Leading Edge Modification (LEM)
    # AeroSandbox applies the LE weight to x^0.5 * (1-x)^n
    lem = le_weight * (x ** 0.5) * ((1.0 - x) ** n_order)
    
    # Calculate Y coordinates including trailing edge thickness
    y_upper = C * S_upper + (x * te_thickness / 2.0) + lem
    y_lower = C * S_lower - (x * te_thickness / 2.0) + lem
    
    return x, y_upper, y_lower

def calculate_kulfan_properties(cst_array):
    """
    Calculates exact max thickness and cross-sectional area.
    Expects cst_array of length 16 (8 upper, 8 lower) or 18 (+ LE, TE).
    """
    upper_weights = cst_array[:8]
    lower_weights = cst_array[8:16]
    le_weight = cst_array[16] if len(cst_array) > 16 else 0.0
    te_thick = cst_array[17] if len(cst_array) > 17 else 0.0
    
    x, y_u, y_l = get_kulfan_coordinates(upper_weights, lower_weights, le_weight, te_thick, n_points=200)
    
    # Max Thickness
    thickness_distribution = y_u - y_l
    max_thickness = np.max(thickness_distribution)
    
    # Trapezoidal Integration for Area
    area = np.trapz(thickness_distribution, x)
    
    return max_thickness, area