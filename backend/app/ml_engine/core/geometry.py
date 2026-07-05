import numpy as np
from scipy.special import comb

def get_cst_coordinates(
    upper_weights: np.ndarray, 
    lower_weights: np.ndarray, 
    leading_edge_weight: float = 0.0, 
    te_thickness: float = 0.0, 
    n_points_per_side: int = 150
) -> np.ndarray:
    """
    Natively generates airfoil coordinates using the Kulfan CST parameterization.
    This exact formulation matches the latent space expected by NeuralFoil.
    
    Parameters:
    - upper_weights (list/array): The 8 weights for the upper surface.
    - lower_weights (list/array): The 8 weights for the lower surface.
    - leading_edge_weight (float): The LEM (Leading Edge Modification) scalar.
    - te_thickness (float): The trailing edge thickness (z/c).
    - n_points_per_side (int): Discretization resolution.
    
    Returns:
    - A 2D numpy array of shape (2*n_points_per_side - 1, 2) containing [x, y] pairs.
      Order is Selig format: Trailing Edge -> Upper Surface -> Leading Edge -> Lower Surface -> Trailing Edge.
    """
    
    # 1. Define the normalized chordwise coordinate (x/c)
    # Using cosine spacing puts more points at the LE and TE where curvature is highest
    beta = np.linspace(0, np.pi, n_points_per_side)
    x = 0.5 * (1 - np.cos(beta))

    # 2. Define the Class Function (C) for a round-nose, sharp-TE airfoil
    # N1 = 0.5 (round nose), N2 = 1.0 (sharp tail)
    N1 = 0.5
    N2 = 1.0
    C = (x ** N1) * ((1 - x) ** N2)

    # 3. Define the Shape Function (S) using Bernstein Polynomials
    def shape_function(x_vals, weights):
        n = len(weights) - 1
        S = np.zeros_like(x_vals)
        for i, weight in enumerate(weights):
            # Bernstein polynomial: K_i,n * x^i * (1-x)^(n-i)
            bernstein_basis = comb(n, i) * (x_vals ** i) * ((1 - x_vals) ** (n - i))
            S += weight * bernstein_basis
        return S

    # 4. Calculate upper and lower base shapes
    y_upper = C * shape_function(x, upper_weights) + x * (te_thickness / 2)
    y_lower = C * shape_function(x, lower_weights) - x * (te_thickness / 2)

    # 5. Apply the Leading-Edge Modification (LEM)
    # This prevents the "pathological singularity" at x=0 common in base CST
    lem_upper = leading_edge_weight * x * ((1 - x) ** len(upper_weights))
    lem_lower = -leading_edge_weight * x * ((1 - x) ** len(lower_weights))
    
    y_upper += lem_upper
    y_lower += lem_lower

    # 6. Assemble into Selig Format (TE -> Upper -> LE -> Lower -> TE)
    # Flip upper surface so it goes from x=1 to x=0
    x_upper_selig = x[::-1]
    y_upper_selig = y_upper[::-1]
    
    # Lower surface goes from x=0 to x=1. 
    # Skip the first point (x=0) to avoid duplicating the leading edge.
    x_lower_selig = x[1:]
    y_lower_selig = y_lower[1:]

    x_final = np.concatenate((x_upper_selig, x_lower_selig))
    y_final = np.concatenate((y_upper_selig, y_lower_selig))

    return np.column_stack((x_final, y_final))


def get_bl_x_points() -> np.ndarray:
    """
    Returns the exact 32 chordwise locations (x/c) where NeuralFoil 
    evaluates the Boundary Layer vectors (Theta, H, ue/Vinf).
    """
    # 32 panels requires 33 boundaries. 
    # The evaluation points are the midpoints of these panels.
    s = np.linspace(0, 1, 32 + 1)
    return (s[1:] + s[:-1]) / 2