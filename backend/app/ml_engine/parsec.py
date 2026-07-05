# backend/app/geometry/parsec.py
"""
PARSEC (Parametric Section) Airfoil Geometry Solver
Solves an 11-parameter system to define airfoil surfaces via polynomial coefficients.
Implements C² continuous Gaussian RBF defect blending.
"""

import numpy as np
from scipy.linalg import solve
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
import math


@dataclass
class PARSECParams:
    """11 fundamental PARSEC parameters defining a complete airfoil topology."""
    r_le: float = 0.015        # Leading-edge radius
    x_up: float = 0.30         # Upper crest x-location
    y_up: float = 0.062        # Upper crest y-location
    d2y_up: float = -0.45      # Upper crest curvature
    x_lo: float = 0.34         # Lower crest x-location
    y_lo: float = -0.020       # Lower crest y-location
    d2y_lo: float = 0.35       # Lower crest curvature
    y_te: float = 0.0          # Trailing-edge y-offset
    delta_y_te: float = 0.0    # Trailing-edge thickness
    alpha_te: float = -0.08    # Trailing-edge direction (radians)
    beta_te: float = 0.15      # Trailing-edge wedge angle (radians)

    def to_vector(self) -> np.ndarray:
        return np.array([
            self.r_le, self.x_up, self.y_up, self.d2y_up,
            self.x_lo, self.y_lo, self.d2y_lo,
            self.y_te, self.delta_y_te, self.alpha_te, self.beta_te
        ])

    @classmethod
    def from_vector(cls, v: np.ndarray) -> 'PARSECParams':
        return cls(
            r_le=v[0], x_up=v[1], y_up=v[2], d2y_up=v[3],
            x_lo=v[4], y_lo=v[5], d2y_lo=v[6],
            y_te=v[7], delta_y_te=v[8], alpha_te=v[9], beta_te=v[10]
        )

    @classmethod
    def from_naca4(cls, m: float, p: float, t: float) -> 'PARSECParams':
        """Approximate PARSEC parameters from NACA 4-digit specification."""
        return cls(
            r_le=1.1019 * (t / 0.2) ** 2,
            x_up=p,
            y_up=m + 0.5 * t * (0.2969 * p**0.5 - 0.126 * p - 0.3516 * p**2 + 0.2843 * p**3 - 0.1015 * p**4),
            d2y_up=-0.45 * (t / 0.12),
            x_lo=p * 1.1,
            y_lo=-0.5 * t * (0.2969 * (p*1.1)**0.5 - 0.126 * (p*1.1)),
            d2y_lo=0.35 * (t / 0.12),
            y_te=0.0,
            delta_y_te=0.0,
            alpha_te=-math.atan(t * 0.5),
            beta_te=math.atan(t * 0.8)
        )


class PARSECSolver:
    """
    Solves the PARSEC polynomial system:
        y(x) = Σ a_n * x^(n-1/2) for n=1..6
    
    Constructs a 6x6 linear system from boundary conditions at:
    LE (x=0), TE (x=1), and Crest (x_crest).
    """

    EXPONENTS = np.array([0.5, 1.5, 2.5, 3.5, 4.5, 5.5])

    def __init__(self, params: PARSECParams, n_points: int = 200):
        self.params = params
        self.n_points = n_points
        self._upper_coeffs = None
        self._lower_coeffs = None
        self._solve()

    def _build_matrix(self, x_crest: float, y_crest: float, d2y_crest: float,
                      y_te: float, dy_te: float) -> Tuple[np.ndarray, np.ndarray]:
        """
        Constructs the 6x6 coefficient matrix and RHS vector from PARSEC BCs.
        
        Boundary Conditions (6 total):
        1. y(1) = y_te                         (Trailing-edge position)
        2. dy/dx(1) = dy_te                     (Trailing-edge slope)
        3. y(x_crest) = y_crest                 (Crest position)
        4. dy/dx(x_crest) = 0                   (Crest is extremum)
        5. d²y/dx²(x_crest) = d2y_crest         (Crest curvature)
        6. Leading-edge radius constraint        (Geometric constraint)
        """
        n = self.EXPONENTS
        x_c = x_crest

        A = np.zeros((6, 6))
        b = np.zeros(6)

        # Row 0: y(1) = y_te → Σ a_n * 1^(n-1/2) = y_te
        A[0, :] = 1.0 ** n
        b[0] = y_te

        # Row 1: dy/dx(1) = dy_te → Σ a_n * n * 1^(n-3/2)
        A[1, :] = n * (1.0 ** (n - 1))
        b[1] = dy_te

        # Row 2: y(x_c) = y_crest
        A[2, :] = x_c ** n
        b[2] = y_crest

        # Row 3: dy/dx(x_c) = 0  (crest tangent horizontal)
        A[3, :] = n * (x_c ** (n - 1))
        b[3] = 0.0

        # Row 4: d²y/dx²(x_c) = d2y_crest
        A[4, :] = n * (n - 1) * (x_c ** (n - 2))
        b[4] = d2y_crest

        # Row 5: LE radius constraint → a_1 = ±sqrt(2*r_le)
        A[5, :] = 0.0
        A[5, 0] = 1.0
        b[5] = math.sqrt(2.0 * self.params.r_le)

        return A, b

    def _solve(self):
        """Solve for upper and lower surface polynomial coefficients."""
        p = self.params

        y_te_upper = p.y_te + p.delta_y_te / 2.0
        y_te_lower = p.y_te - p.delta_y_te / 2.0
        dy_te_upper = math.tan(p.alpha_te - p.beta_te / 2.0)
        dy_te_lower = math.tan(p.alpha_te + p.beta_te / 2.0)

        A_up, b_up = self._build_matrix(p.x_up, p.y_up, p.d2y_up, y_te_upper, dy_te_upper)
        b_up[5] = math.sqrt(2.0 * p.r_le)  # Positive root for upper

        A_lo, b_lo = self._build_matrix(p.x_lo, p.y_lo, p.d2y_lo, y_te_lower, dy_te_lower)
        b_lo[5] = -math.sqrt(2.0 * p.r_le)  # Negative root for lower

        try:
            self._upper_coeffs = solve(A_up, b_up)
            self._lower_coeffs = solve(A_lo, b_lo)
        except np.linalg.LinAlgError:
            # Fallback: regularize
            self._upper_coeffs = solve(A_up + np.eye(6) * 1e-10, b_up)
            self._lower_coeffs = solve(A_lo + np.eye(6) * 1e-10, b_lo)

    def evaluate(self, x: np.ndarray, surface: str = 'upper') -> np.ndarray:
        """Evaluate y-coordinates along the surface at given x stations."""
        coeffs = self._upper_coeffs if surface == 'upper' else self._lower_coeffs
        x_safe = np.clip(x, 1e-12, 1.0)
        y = np.zeros_like(x_safe)
        for i, exp in enumerate(self.EXPONENTS):
            y += coeffs[i] * x_safe ** exp
        return y

    def generate_coordinates(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate full airfoil coordinate loop.
        Uses cosine-clustered spacing for LE/TE resolution.
        Returns (x_array, y_array) in standard counter-clockwise order.
        """
        beta = np.linspace(0, np.pi, self.n_points)
        x = 0.5 * (1.0 - np.cos(beta))  # Cosine clustering

        y_upper = self.evaluate(x, 'upper')
        y_lower = self.evaluate(x, 'lower')

        # Counter-clockwise: upper TE→LE, then lower LE→TE
        x_full = np.concatenate([x[::-1], x[1:]])
        y_full = np.concatenate([y_upper[::-1], y_lower[1:]])

        return x_full, y_full

    def surface_curvature(self, x: np.ndarray, surface: str = 'upper') -> np.ndarray:
        """Compute local curvature κ = |y''| / (1 + y'²)^(3/2)."""
        coeffs = self._upper_coeffs if surface == 'upper' else self._lower_coeffs
        x_safe = np.clip(x, 1e-10, 1.0)
        n = self.EXPONENTS

        dy = np.zeros_like(x_safe)
        d2y = np.zeros_like(x_safe)
        for i, exp in enumerate(n):
            dy += coeffs[i] * exp * x_safe ** (exp - 1)
            d2y += coeffs[i] * exp * (exp - 1) * x_safe ** (exp - 2)

        kappa = np.abs(d2y) / (1.0 + dy ** 2) ** 1.5
        return kappa

    def leading_edge_radius(self) -> float:
        """Compute actual leading-edge radius from polynomial coefficients."""
        return 0.5 * self._upper_coeffs[0] ** 2

    def to_cst(self, order: int = 8) -> Tuple[List[float], List[float]]:
        """
        Convert PARSEC surface to CST coefficients via least-squares fitting.
        Enables backward compatibility with existing CST pipeline.
        """
        from app.utils.cst_generation import fit_cst_coefficients
        x_full, y_full = self.generate_coordinates()
        half = len(x_full) // 2
        x_up = x_full[:half][::-1]
        y_up = y_full[:half][::-1]
        x_lo = x_full[half:]
        y_lo = y_full[half:]
        a_upper = fit_cst_coefficients(x_up, y_up, order)
        a_lower = fit_cst_coefficients(x_lo, y_lo, order)
        return a_upper, a_lower


class GaussianRBFBlender:
    """
    C² Continuous Gaussian Radial Basis Function blending for defect application.
    Eliminates non-physical pressure singularities at defect boundaries by
    ensuring smooth curvature transitions.
    """

    def __init__(self, support_radius: float = 0.15, order: int = 3):
        self.support_radius = support_radius
        self.order = order

    def wendland_c2(self, r: np.ndarray, h: float) -> np.ndarray:
        """
        Wendland C² compactly supported RBF.
        φ(r) = (1 - r/h)^4 * (4r/h + 1) for r < h, else 0
        Guarantees C² continuity and compact support (zero outside radius h).
        """
        q = np.clip(r / h, 0, 1)
        phi = (1 - q) ** 4 * (4 * q + 1)
        phi[r >= h] = 0.0
        return phi

    def gaussian_rbf(self, r: np.ndarray, epsilon: float = 20.0) -> np.ndarray:
        """Standard Gaussian RBF: φ(r) = exp(-ε²r²)."""
        return np.exp(-epsilon ** 2 * r ** 2)

    def blend_defect(self, surface_x: np.ndarray, surface_y: np.ndarray,
                     defect_x: float, defect_amplitude: float,
                     defect_width: float, defect_profile: str = 'gaussian') -> np.ndarray:
        """
        Apply a defect perturbation with C² blended boundaries.
        
        Args:
            surface_x: x-coordinates of surface
            surface_y: y-coordinates of surface (modified in-place conceptually)
            defect_x: chordwise location of defect center
            defect_amplitude: maximum height perturbation
            defect_width: characteristic width
            defect_profile: shape of the core perturbation
            
        Returns:
            Perturbation delta-y array with smooth blending
        """
        r = np.abs(surface_x - defect_x)

        # Core perturbation shape
        if defect_profile == 'gaussian':
            core = defect_amplitude * np.exp(-0.5 * (r / (defect_width * 0.4)) ** 2)
        elif defect_profile == 'parabolic':
            core = defect_amplitude * np.maximum(0, 1.0 - (r / defect_width) ** 2)
        elif defect_profile == 'horn':
            # Bimodal horn shape
            horn1 = np.exp(-0.5 * (r / (defect_width * 0.25)) ** 2)
            horn2 = np.exp(-0.5 * ((surface_x - defect_x - defect_width * 0.6) / (defect_width * 0.2)) ** 2)
            core = defect_amplitude * (horn1 + 0.6 * horn2)
        elif defect_profile == 'step':
            from scipy.special import expit
            sigmoid = expit(60 * (surface_x - defect_x))
            decay = np.maximum(0, 1.0 - (surface_x - defect_x) / defect_width)
            core = defect_amplitude * sigmoid * decay
        else:
            core = defect_amplitude * np.exp(-0.5 * (r / (defect_width * 0.4)) ** 2)

        # Apply C² Wendland blending envelope
        blend_radius = defect_width * 2.5
        envelope = self.wendland_c2(r, blend_radius)

        return core * envelope


class InverseDesignSolver:
    """
    Inverse Design Engine: Given a target Cp distribution,
    find PARSEC parameters that produce the closest match.
    Uses gradient-free Nelder-Mead optimization.
    """

    def __init__(self, target_cp_upper: np.ndarray, target_cp_lower: np.ndarray,
                 x_stations: np.ndarray, reynolds: float = 3e6, alpha: float = 5.0):
        self.target_cp_upper = target_cp_upper
        self.target_cp_lower = target_cp_lower
        self.x_stations = x_stations
        self.reynolds = reynolds
        self.alpha = alpha

    def objective(self, param_vector: np.ndarray) -> float:
        """
        Cost function: L2 norm between predicted and target Cp distributions.
        """
        try:
            params = PARSECParams.from_vector(np.clip(param_vector, 
                [0.001, 0.1, 0.01, -2.0, 0.1, -0.1, 0.01, -0.02, 0.0, -0.3, 0.0],
                [0.1, 0.6, 0.15, 0.0, 0.6, 0.0, 2.0, 0.02, 0.02, 0.0, 0.5]
            ))
            solver = PARSECSolver(params)
            
            y_up = solver.evaluate(self.x_stations, 'upper')
            y_lo = solver.evaluate(self.x_stations, 'lower')
            
            # Thin airfoil theory approximation for Cp
            dy_up = np.gradient(y_up, self.x_stations)
            dy_lo = np.gradient(y_lo, self.x_stations)
            
            cp_up_approx = -2.0 * dy_up
            cp_lo_approx = 2.0 * dy_lo
            
            err = np.sum((cp_up_approx - self.target_cp_upper) ** 2 +
                         (cp_lo_approx - self.target_cp_lower) ** 2)
            return float(err)
        except Exception:
            return 1e10

    def solve(self, max_iter: int = 500) -> PARSECParams:
        from scipy.optimize import minimize
        initial = PARSECParams().to_vector()
        result = minimize(self.objective, initial, method='Nelder-Mead',
                         options={'maxiter': max_iter, 'xatol': 1e-8, 'fatol': 1e-8})
        return PARSECParams.from_vector(result.x)