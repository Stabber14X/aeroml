import numpy as np
from scipy.optimize import minimize
from scipy.special import comb
from scipy.interpolate import PchipInterpolator

# --- MATH KERNELS ---

def bernstein_poly(n, r, t):
    """
    Calculates Bernstein basis polynomial B_{r,n}(t).
    """
    # Safety clip to avoid domain errors
    t = np.clip(t, 0, 1)
    return comb(n, r) * (t ** r) * ((1 - t) ** (n - r))

def cst_curve(t, coeffs, N1=0.5, N2=1.0):
    """
    Computes the Y coordinates for a set of CST coefficients.
    """
    t = np.clip(t, 0, 1)
    C = (t ** N1) * ((1 - t) ** N2)
    
    n = len(coeffs) - 1
    S = np.zeros_like(t)
    for i in range(n + 1):
        S += coeffs[i] * bernstein_poly(n, i, t)
        
    return C * S

def fit_single_surface_advanced(x_raw, y_raw, n_coeffs=8):
    """
    Elite-Tier Fitting Routine:
    1. Uses PCHIP interpolation (monotonic) to prevent oscillation.
    2. Uses Cosine Spacing for high-density nose resolution.
    3. Uses L2 Loss + Curvature Penalty for smoothness.
    """
    # 1. CLEAN & SORT DATA
    # Remove duplicates
    _, unique_indices = np.unique(x_raw, return_index=True)
    x_unique = x_raw[unique_indices]
    y_unique = y_raw[unique_indices]
    
    # Sort
    sort_idx = np.argsort(x_unique)
    x_sorted = x_unique[sort_idx]
    y_sorted = y_unique[sort_idx]

    # 2. HIGH-FIDELITY INTERPOLATION
    # PchipInterpolator is crucial here because it preserves monotonicity.
    # Standard splines can "overshoot" on sharp curves, causing bad fits.
    interpolator = PchipInterpolator(x_sorted, y_sorted)

    # 3. GENERATE TARGET GRID (Cosine Spacing)
    # We generate 200 points clustered at the edges to capture the nose perfectly.
    num_fit_points = 200
    beta = np.linspace(0, np.pi, num_fit_points)
    x_grid = 0.5 * (1 - np.cos(beta))
    y_target = interpolator(x_grid)

    # 4. WEIGHTING MATRIX
    # Nose (0-5%) gets extreme weight.
    weights = np.ones_like(x_grid)
    weights[x_grid < 0.02] = 50.0  # Extreme nose priority
    weights[x_grid < 0.10] = 10.0  # Leading edge priority
    weights[x_grid > 0.90] = 5.0   # Trailing edge priority

    # 5. LOSS FUNCTION
    def objective(coeffs):
        # Calculate CST curve
        y_pred = cst_curve(x_grid, coeffs)
        
        # 1. Position Error (Weighted RMSE)
        error = (y_pred - y_target) * weights
        mse_loss = np.sum(error**2)
        
        # 2. Smoothness Regularization (Penalty for wild coefficient swings)
        # This prevents the "wobbly" shapes that differ from the library.
        # We penalize the second derivative of the coefficients themselves.
        smoothness_penalty = 0
        if len(coeffs) > 2:
            derivs = np.diff(coeffs, 2) # Second difference
            smoothness_penalty = np.sum(derivs**2) * 0.005

        return mse_loss + smoothness_penalty

    # 6. OPTIMIZATION
    # We use SLSQP because it handles constraints well
    initial_guess = np.zeros(n_coeffs)
    
    # Bounds: Coefficients typically lie between -1 and 1 for normal airfoils
    bounds = [(-1.0, 1.0) for _ in range(n_coeffs)]
    
    res = minimize(
        objective,
        initial_guess,
        method='SLSQP',
        bounds=bounds,
        tol=1e-8, # High precision tolerance
        options={'maxiter': 500}
    )
    
    return res.x.tolist()

def process_dat_file(content: str):
    """
    Ingests raw .dat, .txt, or .csv text and returns high-fidelity 16 CST coefficients.
    """
    lines = content.strip().split('\n')
    
    # 1. READ COORDINATES ROBUSTLY
    coords = []
    start_idx = 0
    
    # Header detection (REWRITTEN TO SUPPORT COMMAS)
    try:
        clean_first = lines[0].replace(',', ' ').strip()
        parts = clean_first.split()
        if len(parts) < 2: raise ValueError
        float(parts[0])
    except:
        start_idx = 1 

    for line in lines[start_idx:]:
        # CRITICAL FIX: Replace commas with spaces so .split() parses CSV natively
        clean_line = line.replace(',', ' ').strip()
        parts = clean_line.split()
        if len(parts) >= 2:
            try:
                coords.append([float(parts[0]), float(parts[1])])
            except ValueError:
                continue
                
    data = np.array(coords)
    if len(data) < 10:
        raise ValueError("Insufficient data points")

    # 2. SPLIT SURFACES (Geometric Method)
    le_idx = np.argmin(data[:, 0])
    
    upper_raw = data[:le_idx+1]
    lower_raw = data[le_idx:]
    
    # 3. NORMALIZE X (0 to 1) & HANDLE ORIENTATION
    # Force Upper: 0 -> 1
    if upper_raw[0, 0] > upper_raw[-1, 0]:
        upper_raw = np.flip(upper_raw, axis=0)
    
    # Force Lower: 0 -> 1
    if lower_raw[0, 0] > lower_raw[-1, 0]:
        lower_raw = np.flip(lower_raw, axis=0)

    # 4. FIT WITH ADVANCED ROUTINE
    a_upper = fit_single_surface_advanced(upper_raw[:, 0], upper_raw[:, 1], n_coeffs=8)
    a_lower = fit_single_surface_advanced(lower_raw[:, 0], lower_raw[:, 1], n_coeffs=8)
    
    return {
        "a_upper": a_upper,
        "a_lower": a_lower
    }