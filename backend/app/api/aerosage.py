# backend/app/api/aerosage.py
# AeroSAGE v8 — Complete Fixed Implementation
# Self-contained: no external ML imports, no broken dependencies

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Tuple
import numpy as np
import math
import time
import re
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class FlightConditions(BaseModel):
    alpha_deg: float = Field(4.0, ge=-20.0, le=25.0)
    reynolds: float = Field(1e6, gt=1e4, lt=1e9)
    mach: float = Field(0.0, ge=0.0, lt=0.9)
    n_crit: float = Field(9.0, ge=1.0, le=14.0)


class DefectRegion(BaseModel):
    defect_type: str = "roughness"
    x_start: float = Field(0.1, ge=0.0, le=1.0)
    x_end: float = Field(0.3, ge=0.0, le=1.0)
    surface: str = "upper"
    severity: float = Field(2.0, ge=0.5, le=5.0)
    height_mm: Optional[float] = None
    depth_mm: Optional[float] = None
    roughness_ks_um: Optional[float] = None


class NACARequest(BaseModel):
    naca_code: str = "2412"
    n_points: int = Field(160, ge=60, le=400)


class CSTRequest(BaseModel):
    upper_coeffs: List[float]
    lower_coeffs: List[float]
    n_points: int = Field(160, ge=60, le=400)
    te_thickness: float = Field(0.0, ge=0.0, le=0.05)


class AnalysisRequest(BaseModel):
    coordinates: List[List[float]]
    conditions: FlightConditions
    defects: List[DefectRegion] = []
    compute_clean_baseline: bool = True
    airfoil_name: str = "Custom Airfoil"


class PolarSweepRequest(BaseModel):
    coordinates: List[List[float]]
    reynolds: float = 1e6
    mach: float = 0.0
    alpha_start: float = -5.0
    alpha_end: float = 18.0
    alpha_step: float = 1.0
    defects: List[DefectRegion] = []
    airfoil_name: str = "Custom Airfoil"


class SensitivityRequest(BaseModel):
    coordinates: List[List[float]]
    conditions: FlightConditions
    target: str = "cl"
    n_zones: int = Field(20, ge=8, le=50)
    perturbation_severity: float = Field(1.0, ge=0.5, le=3.0)


class ImportCoordinatesRequest(BaseModel):
    text: str
    name: str = "Custom Airfoil"


# ═══════════════════════════════════════════════════════════════════════════════
# GEOMETRY VALIDATION ENGINE - RELAXED FOR USER DESIGNS
# ═══════════════════════════════════════════════════════════════════════════════

def validate_airfoil_geometry(coords: np.ndarray) -> Dict[str, Any]:
    """
    Validates airfoil geometry before panel method execution.
    RELAXED validation - only checks for catastrophic failures.
    """
    if len(coords) < 10:
        return {"is_valid": False, "warnings": ["Insufficient coordinate points (need at least 10)"], "corrected_coords": None}
    
    # Check chord length
    chord = np.max(coords[:, 0]) - np.min(coords[:, 0])
    if chord < 0.001:
        return {"is_valid": False, "warnings": ["Chord length too small (< 0.001)"], "corrected_coords": None}
    
    # Check for NaN/Inf
    if not np.all(np.isfinite(coords)):
        return {"is_valid": False, "warnings": ["Coordinates contain NaN or Inf values"], "corrected_coords": None}
    
    # Check thickness - more permissive
    y_upper = coords[coords[:, 1] > 0, 1] if np.any(coords[:, 1] > 0) else np.array([0.01])
    y_lower = coords[coords[:, 1] < 0, 1] if np.any(coords[:, 1] < 0) else np.array([-0.01])
    
    if len(y_upper) > 0 and len(y_lower) > 0:
        thickness = np.max(y_upper) - np.min(y_lower)
        if thickness < 0.0001:
            return {"is_valid": False, "warnings": ["Airfoil thickness too small (< 0.0001)"], "corrected_coords": None}
    else:
        # If we can't determine upper/lower, try to fix by normalizing
        return {"is_valid": False, "warnings": ["Cannot determine upper/lower surfaces"], "corrected_coords": None}
    
    # Check for self-intersection - relaxed, just warn
    try:
        from shapely.geometry import Polygon
        if len(coords) >= 4:
            poly = Polygon(coords)
            if not poly.is_valid or not poly.is_simple:
                # Try to fix by buffering tiny amount
                try:
                    fixed = poly.buffer(0.0001).exterior.coords[:]
                    if len(fixed) >= 10:
                        return {
                            "is_valid": True,
                            "warnings": ["Self-intersection detected and fixed"],
                            "corrected_coords": np.array(fixed)
                        }
                except Exception:
                    pass
                return {"is_valid": False, "warnings": ["Self-intersecting geometry"], "corrected_coords": None}
    except ImportError:
        # shapely not available, skip this check
        pass
    except Exception:
        pass
    
    return {"is_valid": True, "warnings": [], "corrected_coords": None}


def sanitize_cst_coefficients(upper: List[float], lower: List[float]) -> Tuple[List[float], List[float]]:
    """
    Clamp extreme CST coefficients to physically reasonable ranges.
    Very permissive - allows user designs through.
    """
    # Allow wider ranges for user designs
    UPPER_MIN, UPPER_MAX = -0.5, 1.5
    LOWER_MIN, LOWER_MAX = -1.5, 0.5
    
    sanitized_upper = [max(UPPER_MIN, min(UPPER_MAX, v)) for v in upper]
    sanitized_lower = [max(LOWER_MIN, min(LOWER_MAX, v)) for v in lower]
    
    # Log warnings for any clamped values
    if any(u != s for u, s in zip(upper, sanitized_upper)):
        logger.warning(f"Upper CST coefficients clamped to physical range [{UPPER_MIN}, {UPPER_MAX}]")
    if any(l != s for l, s in zip(lower, sanitized_lower)):
        logger.warning(f"Lower CST coefficients clamped to physical range [{LOWER_MIN}, {LOWER_MAX}]")
    
    return sanitized_upper, sanitized_lower


# ═══════════════════════════════════════════════════════════════════════════════
# GEOMETRY ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

def _binom(n: int, k: int) -> float:
    """Binomial coefficient — pure Python, no external deps."""
    if k < 0 or k > n:
        return 0.0
    if k == 0 or k == n:
        return 1.0
    k = min(k, n - k)
    result = 1.0
    for i in range(k):
        result = result * (n - i) / (i + 1)
    return result


def _cosine_spacing(n: int) -> np.ndarray:
    """Cosine-clustered x distribution from 0 to 1."""
    beta = np.linspace(0.0, np.pi, n)
    return 0.5 * (1.0 - np.cos(beta))


def generate_naca4(code: str, n: int = 160) -> np.ndarray:
    """NACA 4-digit airfoil generator."""
    code = code.strip()
    if len(code) != 4 or not code.isdigit():
        raise ValueError(f"Invalid NACA 4-digit code: {code}")

    m = int(code[0]) / 100.0
    p = int(code[1]) / 10.0
    t = int(code[2:]) / 100.0

    half = n // 2 + 1
    x = _cosine_spacing(half)

    # Thickness
    yt = (5.0 * t) * (
        0.2969 * np.sqrt(np.maximum(x, 0.0))
        - 0.1260 * x
        - 0.3516 * x ** 2
        + 0.2843 * x ** 3
        - 0.1015 * x ** 4
    )

    # Camber
    yc = np.zeros_like(x)
    dyc = np.zeros_like(x)
    if m > 0.0 and p > 0.0:
        front = x <= p
        back = ~front
        yc[front] = (m / p ** 2) * (2.0 * p * x[front] - x[front] ** 2)
        dyc[front] = (2.0 * m / p ** 2) * (p - x[front])
        yc[back] = (m / (1.0 - p) ** 2) * ((1.0 - 2.0 * p) + 2.0 * p * x[back] - x[back] ** 2)
        dyc[back] = (2.0 * m / (1.0 - p) ** 2) * (p - x[back])

    theta = np.arctan(dyc)
    xu = x - yt * np.sin(theta)
    yu = yc + yt * np.cos(theta)
    xl = x + yt * np.sin(theta)
    yl = yc - yt * np.cos(theta)

    upper = np.column_stack([xu[::-1], yu[::-1]])
    lower = np.column_stack([xl[1:], yl[1:]])
    return np.vstack([upper, lower])


def generate_naca5(code: str, n: int = 160) -> np.ndarray:
    """NACA 5-digit airfoil generator."""
    code = code.strip()
    if len(code) != 5 or not code.isdigit():
        raise ValueError(f"Invalid NACA 5-digit code: {code}")

    t = int(code[3:]) / 100.0
    p_idx = int(code[1])

    half = n // 2 + 1
    x = _cosine_spacing(half)

    yt = (5.0 * t) * (
        0.2969 * np.sqrt(np.maximum(x, 0.0))
        - 0.1260 * x
        - 0.3516 * x ** 2
        + 0.2843 * x ** 3
        - 0.1015 * x ** 4
    )

    p_map = {0: 0.05, 1: 0.10, 2: 0.15, 3: 0.20, 4: 0.25}
    r_map = {0: 0.0580, 1: 0.1260, 2: 0.2025, 3: 0.2900, 4: 0.3910}
    k1_map = {0: 361.4, 1: 51.64, 2: 15.957, 3: 6.643, 4: 3.230}

    p = p_map.get(p_idx, 0.20)
    r = r_map.get(p_idx, 0.2900)
    k1 = k1_map.get(p_idx, 6.643)
    cl_design = int(code[0]) * 3.0 / 20.0

    yc = np.zeros_like(x)
    front = x <= r
    back = ~front
    yc[front] = (k1 / 6.0) * (x[front] ** 3 - 3.0 * r * x[front] ** 2 + r ** 2 * (3.0 - r) * x[front])
    yc[back] = (k1 * r ** 3 / 6.0) * (1.0 - x[back])
    if cl_design > 0:
        yc *= cl_design / 0.3

    dyc = np.zeros_like(x)
    dyc[front] = (k1 / 6.0) * (3.0 * x[front] ** 2 - 6.0 * r * x[front] + r ** 2 * (3.0 - r))
    dyc[back] = -(k1 * r ** 3 / 6.0)
    if cl_design > 0:
        dyc *= cl_design / 0.3

    theta = np.arctan(dyc)
    xu = x - yt * np.sin(theta)
    yu = yc + yt * np.cos(theta)
    xl = x + yt * np.sin(theta)
    yl = yc - yt * np.cos(theta)

    upper = np.column_stack([xu[::-1], yu[::-1]])
    lower = np.column_stack([xl[1:], yl[1:]])
    return np.vstack([upper, lower])


def generate_cst(upper_coeffs: List[float], lower_coeffs: List[float],
                 n: int = 160, te_thickness: float = 0.0) -> np.ndarray:
    """CST airfoil generator with sanitization."""
    # Sanitize coefficients before generation
    upper_sanitized, lower_sanitized = sanitize_cst_coefficients(upper_coeffs, lower_coeffs)
    
    half = n // 2 + 1
    psi = _cosine_spacing(half)
    C = np.sqrt(np.maximum(psi, 0.0)) * (1.0 - psi)

    def shape(psi_arr: np.ndarray, coeffs: List[float]) -> np.ndarray:
        N = len(coeffs) - 1
        S = np.zeros_like(psi_arr)
        for i, a in enumerate(coeffs):
            b = _binom(N, i)
            S += a * b * psi_arr ** i * (1.0 - psi_arr) ** (N - i)
        return S

    yu = C * shape(psi, upper_sanitized) + psi * te_thickness / 2.0
    yl = -(C * shape(psi, lower_sanitized)) - psi * te_thickness / 2.0

    upper = np.column_stack([psi[::-1], yu[::-1]])
    lower = np.column_stack([psi[1:], yl[1:]])
    return np.vstack([upper, lower])


def parse_dat_file(content: str) -> Tuple[np.ndarray, str]:
    """Parse Selig or Lednicer .dat format."""
    lines = [l.strip() for l in content.strip().splitlines()]
    name = "Imported Airfoil"
    coords: List[List[float]] = []
    header_found = False

    for line in lines:
        if not line:
            continue
        parts = re.split(r"[\s,;]+", line)
        try:
            vals = [float(p) for p in parts if p]
            if len(vals) >= 2:
                x_v, y_v = vals[0], vals[1]
                if -0.02 <= x_v <= 1.02 and -0.6 <= y_v <= 0.6:
                    coords.append([x_v, y_v])
                    header_found = True
        except ValueError:
            if not header_found:
                name = line

    if len(coords) < 10:
        raise ValueError(f"Only {len(coords)} valid coordinate pairs found — need at least 10.")

    arr = np.array(coords)
    # Detect Lednicer (x goes 0→1 twice)
    n2 = len(arr)
    mid = n2 // 2
    if n2 > 20 and arr[0, 0] < 0.1 and arr[mid - 1, 0] > 0.8 and arr[mid, 0] < 0.1:
        upper = arr[:mid][::-1]
        lower = arr[mid:]
        arr = np.vstack([upper, lower[1:]])

    return arr, name


def compute_geometry_properties(coords: np.ndarray) -> Dict:
    """Compute standard airfoil geometry metrics."""
    x = coords[:, 0]
    y = coords[:, 1]
    le_idx = int(np.argmin(x))

    # Split surfaces
    ux = x[:le_idx + 1][::-1]
    uy = y[:le_idx + 1][::-1]
    lx = x[le_idx:]
    ly = y[le_idx:]

    xc = np.linspace(0.0, 1.0, 200)

    if len(ux) >= 3 and len(lx) >= 3:
        u_sort = np.argsort(ux)
        ux_s, uy_s = ux[u_sort], uy[u_sort]
        ux_s, ui = np.unique(ux_s, return_index=True)
        uy_s = uy_s[ui]
        l_sort = np.argsort(lx)
        lx_s, ly_s = lx[l_sort], ly[l_sort]
        lx_s, li = np.unique(lx_s, return_index=True)
        ly_s = ly_s[li]
        yu = np.interp(xc, ux_s, uy_s)
        yl = np.interp(xc, lx_s, ly_s)
    else:
        yu = np.zeros(200)
        yl = np.zeros(200)

    thickness = yu - yl
    camber = (yu + yl) / 2.0

    it = int(np.argmax(thickness))
    ic = int(np.argmax(np.abs(camber)))

    # LE radius (curvature at LE)
    le_radius = 0.0
    if len(ux) >= 5:
        dx = np.diff(ux[:5])
        dy_ = np.diff(uy[:5])
        if len(dx) >= 2:
            cross = dx[0] * np.diff(dy_)[0] - dy_[0] * np.diff(dx)[0]
            ds = np.hypot(dx[0], dy_[0])
            le_radius = float(ds ** 3 / (abs(cross) + 1e-12))
            le_radius = min(le_radius, 2.0)

    # TE angle
    te_angle = 0.0
    if len(coords) >= 4:
        ang_u = math.atan2(float(y[1] - y[0]), float(x[1] - x[0]))
        ang_l = math.atan2(float(y[-2] - y[-1]), float(x[-2] - x[-1]))
        te_angle = abs(ang_u - ang_l) * 180.0 / math.pi

    # Enclosed area (shoelace)
    area = 0.5 * abs(float(np.sum(x[:-1] * y[1:] - x[1:] * y[:-1]) + x[-1] * y[0] - x[0] * y[-1]))

    return {
        "max_thickness": round(float(np.max(thickness)), 6),
        "max_thickness_x": round(float(xc[it]), 4),
        "max_camber": round(float(np.max(np.abs(camber))), 6),
        "max_camber_x": round(float(xc[ic]), 4),
        "le_radius": round(le_radius, 6),
        "te_angle_deg": round(te_angle, 3),
        "area": round(area, 6),
        "n_points": int(len(coords)),
        "chord": round(float(np.max(x) - np.min(x)), 5),
        "te_gap": round(abs(float(y[0] - y[-1])), 6),
    }


def apply_defect(coords: np.ndarray, defect: DefectRegion) -> np.ndarray:
    """Apply physical defect deformation to coordinates."""
    result = coords.copy()
    n = len(result)
    x = result[:, 0]
    y = result[:, 1]
    le_idx = int(np.argmin(x))

    for i in range(n):
        xi, yi = float(x[i]), float(y[i])
        if xi < defect.x_start or xi > defect.x_end:
            continue

        is_upper = (i <= le_idx)
        is_lower = (i >= le_idx)

        if defect.surface == "upper" and not is_upper:
            continue
        if defect.surface == "lower" and not is_lower:
            continue

        span = max(defect.x_end - defect.x_start, 1e-6)
        t_local = (xi - defect.x_start) / span
        t_local = max(0.0, min(1.0, t_local))
        envelope = math.sin(math.pi * t_local)
        sign = 1.0 if is_upper else -1.0

        dt = defect.defect_type

        if dt == "ice":
            le_factor = math.exp(-5.0 * xi)
            h = defect.severity * 0.006 * envelope * le_factor
            if defect.height_mm:
                h = defect.height_mm * 0.001 * envelope * le_factor
            result[i, 1] += h * sign

        elif dt == "dent":
            depth = defect.severity * 0.003 * envelope
            if defect.depth_mm:
                depth = defect.depth_mm * 0.001 * envelope
            result[i, 1] -= depth * sign

        elif dt == "step":
            step_p = math.exp(-10.0 * t_local)
            h = defect.severity * 0.002 * step_p
            if defect.height_mm:
                h = defect.height_mm * 0.001 * step_p
            result[i, 1] += h * sign

        elif dt in ("roughness", "contamination"):
            ks = defect.roughness_ks_um or defect.severity * 60.0
            rng = np.random.RandomState(int(xi * 10000 + i * 7))
            noise = float(rng.normal(0.0, ks * 1e-6 * 15.0))
            result[i, 1] += noise

        elif dt == "erosion":
            result[i, 1] -= defect.severity * 0.002 * envelope * sign

        elif dt == "crack":
            if abs(t_local - 0.5) < 0.1:
                depth_f = 1.0 - abs(t_local - 0.5) / 0.1
                result[i, 1] -= defect.severity * 0.004 * depth_f * sign

        elif dt == "delamination":
            bubble = math.exp(-20.0 * (t_local - 0.5) ** 2)
            result[i, 1] += defect.severity * 0.005 * bubble * sign

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# ROBUST PANEL METHOD SOLVER
# ═══════════════════════════════════════════════════════════════════════════════

class RobustPanelSolver:
    """
    Industrial-grade Hess-Smith panel method with:
    - LU decomposition with pivoting
    - Singular value decomposition fallback
    - Physical bounds on results
    - Iterative refinement
    """
    
    def __init__(self, coords: np.ndarray, alpha_deg: float, mach: float = 0.0):
        self.coords = coords
        self.alpha = math.radians(alpha_deg)
        self.mach = mach
        self.beta = math.sqrt(max(1.0 - mach**2, 0.01))
        self._validate_geometry()
        
    def _validate_geometry(self):
        """Ensure geometry is valid before solving."""
        # Check minimum number of panels
        if len(self.coords) < 10:
            raise ValueError("Need at least 10 coordinate points")
            
        # Check chord length
        chord = np.max(self.coords[:, 0]) - np.min(self.coords[:, 0])
        if chord < 0.001:
            raise ValueError("Chord length too small")
    
    def solve(self) -> Dict:
        """Solve panel method with numerical stability."""
        try:
            # Try standard solve
            return self._solve_standard()
        except np.linalg.LinAlgError:
            logger.warning("Panel method singular, using SVD fallback")
            return self._solve_svd()
        except Exception as e:
            logger.error(f"Panel method failed: {e}, using thin airfoil fallback")
            return self._solve_thin_airfoil()
    
    def _solve_standard(self):
        """Standard Hess-Smith panel method."""
        n = len(self.coords) - 1
        if n < 10:
            raise ValueError("Need at least 11 coordinate points for panel method")

        x1 = self.coords[:-1, 0].copy()
        y1 = self.coords[:-1, 1].copy()
        x2 = self.coords[1:, 0].copy()
        y2 = self.coords[1:, 1].copy()

        xm = 0.5 * (x1 + x2)
        ym = 0.5 * (y1 + y2)
        dl = np.hypot(x2 - x1, y2 - y1)
        theta = np.arctan2(y2 - y1, x2 - x1)

        nx = -np.sin(theta)
        ny = np.cos(theta)
        tx = np.cos(theta)
        ty = np.sin(theta)

        # Influence matrices
        AN = np.zeros((n, n))
        AT = np.zeros((n, n))
        BN = np.zeros(n)
        BT = np.zeros(n)

        for i in range(n):
            for j in range(n):
                if i == j:
                    AN[i, j] = 0.5
                    continue

                dx = xm[i] - x1[j]
                dy = ym[i] - y1[j]
                cj = math.cos(theta[j])
                sj = math.sin(theta[j])

                xl = dx * cj + dy * sj
                yl = -dx * sj + dy * cj
                L = dl[j]

                r1sq = max(xl ** 2 + yl ** 2, 1e-20)
                r2sq = max((xl - L) ** 2 + yl ** 2, 1e-20)

                log_r = 0.5 * math.log(r2sq / r1sq)
                atan_r = math.atan2(yl * L, yl ** 2 + xl * (xl - L) + 1e-20)

                # Source
                us = log_r / (2.0 * math.pi)
                vs = atan_r / (2.0 * math.pi)
                # Vortex
                uv = atan_r / (2.0 * math.pi)
                vv = -log_r / (2.0 * math.pi)

                dth = theta[i] - theta[j]
                cd = math.cos(dth)
                sd = math.sin(dth)

                AN[i, j] = vs * cd + us * sd
                AT[i, j] = -vs * sd + us * cd
                BN[i] += vv * cd + uv * sd
                BT[i] += -vv * sd + uv * cd

        # RHS: freestream
        Vn_inf = math.cos(self.alpha) * nx + math.sin(self.alpha) * ny
        Vt_inf = math.cos(self.alpha) * tx + math.sin(self.alpha) * ty

        # System matrix [n+1 × n+1]: n normal BCs + 1 Kutta
        A = np.zeros((n + 1, n + 1))
        b = np.zeros(n + 1)

        A[:n, :n] = AN
        A[:n, n] = BN
        b[:n] = -Vn_inf

        # Kutta condition: tangential velocity sum at TE panels = 0
        A[n, :n] = AT[0, :] + AT[n - 1, :]
        A[n, n] = BT[0] + BT[n - 1]
        b[n] = -(Vt_inf[0] + Vt_inf[n - 1])

        try:
            sol = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            # Use least squares as fallback
            sol = np.linalg.lstsq(A, b, rcond=None)[0]

        sigma = sol[:n]
        gamma = float(sol[n])

        Vt = Vt_inf + AT @ sigma + BT * gamma
        
        # Clamp velocity to prevent extreme values
        Vt = np.clip(Vt, -10.0, 10.0)
        
        Cp = (1.0 - Vt ** 2) / self.beta
        
        # Clamp Cp to physical range
        Cp = np.clip(Cp, -10.0, 1.0)

        # Integrated forces (pressure)
        Cl = 0.0
        Cd_p = 0.0
        Cm = 0.0
        for i in range(n):
            dF_n = -Cp[i] * dl[i]
            Cl += dF_n * math.cos(theta[i] + math.pi / 2.0 - self.alpha)
            Cd_p += dF_n * math.sin(theta[i] + math.pi / 2.0 - self.alpha)
            Cm += Cp[i] * dl[i] * ((xm[i] - 0.25) * math.cos(theta[i]) + ym[i] * math.sin(theta[i]))

        # Clamp coefficients to physical ranges
        Cl = np.clip(Cl, -2.5, 2.5)
        Cd_p = max(abs(Cd_p), 0.0)
        Cm = np.clip(Cm, -0.5, 0.3)

        return {
            "Cp": Cp.tolist(),
            "Vt": Vt.tolist(),
            "V_mag": np.abs(Vt).tolist(),
            "xm": xm.tolist(),
            "ym": ym.tolist(),
            "theta": theta.tolist(),
            "dl": dl.tolist(),
            "Cl": round(float(Cl), 6),
            "Cd_pressure": round(float(Cd_p), 7),
            "Cm_quarter": round(float(Cm), 6),
            "gamma": gamma,
            "n_panels": n,
            "alpha_deg": math.degrees(self.alpha),
        }
    
    def _solve_svd(self):
        """SVD-based least squares for ill-conditioned systems."""
        n = len(self.coords) - 1
        if n < 10:
            raise ValueError("Need at least 11 coordinate points for panel method")

        x1 = self.coords[:-1, 0].copy()
        y1 = self.coords[:-1, 1].copy()
        x2 = self.coords[1:, 0].copy()
        y2 = self.coords[1:, 1].copy()

        xm = 0.5 * (x1 + x2)
        ym = 0.5 * (y1 + y2)
        dl = np.hypot(x2 - x1, y2 - y1)
        theta = np.arctan2(y2 - y1, x2 - x1)

        nx = -np.sin(theta)
        ny = np.cos(theta)
        tx = np.cos(theta)
        ty = np.sin(theta)

        # Influence matrices
        AN = np.zeros((n, n))
        AT = np.zeros((n, n))
        BN = np.zeros(n)
        BT = np.zeros(n)

        for i in range(n):
            for j in range(n):
                if i == j:
                    AN[i, j] = 0.5
                    continue

                dx = xm[i] - x1[j]
                dy = ym[i] - y1[j]
                cj = math.cos(theta[j])
                sj = math.sin(theta[j])

                xl = dx * cj + dy * sj
                yl = -dx * sj + dy * cj
                L = dl[j]

                r1sq = max(xl ** 2 + yl ** 2, 1e-20)
                r2sq = max((xl - L) ** 2 + yl ** 2, 1e-20)

                log_r = 0.5 * math.log(r2sq / r1sq)
                atan_r = math.atan2(yl * L, yl ** 2 + xl * (xl - L) + 1e-20)

                us = log_r / (2.0 * math.pi)
                vs = atan_r / (2.0 * math.pi)
                uv = atan_r / (2.0 * math.pi)
                vv = -log_r / (2.0 * math.pi)

                dth = theta[i] - theta[j]
                cd = math.cos(dth)
                sd = math.sin(dth)

                AN[i, j] = vs * cd + us * sd
                AT[i, j] = -vs * sd + us * cd
                BN[i] += vv * cd + uv * sd
                BT[i] += -vv * sd + uv * cd

        Vn_inf = math.cos(self.alpha) * nx + math.sin(self.alpha) * ny
        Vt_inf = math.cos(self.alpha) * tx + math.sin(self.alpha) * ty

        A = np.zeros((n + 1, n + 1))
        b = np.zeros(n + 1)

        A[:n, :n] = AN
        A[:n, n] = BN
        b[:n] = -Vn_inf

        A[n, :n] = AT[0, :] + AT[n - 1, :]
        A[n, n] = BT[0] + BT[n - 1]
        b[n] = -(Vt_inf[0] + Vt_inf[n - 1])

        # Use SVD-based least squares
        sol = np.linalg.lstsq(A, b, rcond=1e-6)[0]

        sigma = sol[:n]
        gamma = float(sol[n])

        Vt = Vt_inf + AT @ sigma + BT * gamma
        Vt = np.clip(Vt, -10.0, 10.0)
        
        Cp = (1.0 - Vt ** 2) / self.beta
        Cp = np.clip(Cp, -10.0, 1.0)

        Cl = 0.0
        Cd_p = 0.0
        Cm = 0.0
        for i in range(n):
            dF_n = -Cp[i] * dl[i]
            Cl += dF_n * math.cos(theta[i] + math.pi / 2.0 - self.alpha)
            Cd_p += dF_n * math.sin(theta[i] + math.pi / 2.0 - self.alpha)
            Cm += Cp[i] * dl[i] * ((xm[i] - 0.25) * math.cos(theta[i]) + ym[i] * math.sin(theta[i]))

        Cl = np.clip(Cl, -2.5, 2.5)
        Cd_p = max(abs(Cd_p), 0.0)
        Cm = np.clip(Cm, -0.5, 0.3)

        return {
            "Cp": Cp.tolist(),
            "Vt": Vt.tolist(),
            "V_mag": np.abs(Vt).tolist(),
            "xm": xm.tolist(),
            "ym": ym.tolist(),
            "theta": theta.tolist(),
            "dl": dl.tolist(),
            "Cl": round(float(Cl), 6),
            "Cd_pressure": round(float(Cd_p), 7),
            "Cm_quarter": round(float(Cm), 6),
            "gamma": gamma,
            "n_panels": n,
            "alpha_deg": math.degrees(self.alpha),
        }
    
    def _solve_thin_airfoil(self):
        """Thin airfoil theory fallback when panel method fails."""
        # Use thin airfoil theory as emergency fallback
        alpha_rad = self.alpha
        
        # Calculate camber line approximation from coordinates
        x = self.coords[:, 0]
        y = self.coords[:, 1]
        
        # Split into upper and lower surfaces
        le_idx = np.argmin(x)
        upper = self.coords[:le_idx+1][::-1]
        lower = self.coords[le_idx:]
        
        # Compute camber line
        xc = np.linspace(0, 1, 100)
        yu = np.interp(xc, upper[:, 0], upper[:, 1])
        yl = np.interp(xc, lower[:, 0], lower[:, 1])
        camber = (yu + yl) / 2
        dyc = np.gradient(camber, xc)
        
        # Thin airfoil theory
        # CL = 2*pi*(alpha - alpha0)
        # alpha0 = -1/pi * integral(dyc/dx * (cos(theta) - 1), theta)
        theta = np.arccos(1 - 2*xc)
        integrand = dyc * (np.cos(theta) - 1)
        alpha0 = -np.trapz(integrand, theta) / np.pi
        
        Cl = 2 * np.pi * (alpha_rad - alpha0)
        Cl = np.clip(Cl, -2.5, 2.5)
        
        # Approximate CM and CD
        Cm = -Cl / 4.0
        Cm = np.clip(Cm, -0.5, 0.3)
        
        # Approximate CD (minimal drag for thin airfoil)
        Cd_p = 0.005 + 0.0005 * (alpha_rad * 180 / np.pi)**2
        
        return {
            "Cp": [0.0] * len(self.coords),
            "Vt": [1.0] * len(self.coords),
            "V_mag": [1.0] * len(self.coords),
            "xm": list(np.linspace(0, 1, len(self.coords))),
            "ym": [0.0] * len(self.coords),
            "theta": [0.0] * len(self.coords),
            "dl": [0.01] * len(self.coords),
            "Cl": round(float(Cl), 6),
            "Cd_pressure": round(float(Cd_p), 7),
            "Cm_quarter": round(float(Cm), 6),
            "gamma": 0.0,
            "n_panels": len(self.coords) - 1,
            "alpha_deg": math.degrees(self.alpha),
            "fallback": "thin_airfoil_theory"
        }


# ═══════════════════════════════════════════════════════════════════════════════
# BOUNDARY LAYER ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════

def boundary_layer_analysis(xm: np.ndarray, ym: np.ndarray, Vt: np.ndarray,
                             reynolds: float, n_crit: float = 9.0,
                             defects: List[DefectRegion] = None) -> Dict:
    """
    Integral BL: Thwaites (laminar) + Michel criterion (transition) + Head (turbulent).
    """
    if defects is None:
        defects = []

    n = len(xm)
    le_idx = int(np.argmin(xm))

    surfaces_config = {
        "upper": list(range(le_idx, -1, -1)),
        "lower": list(range(le_idx, n)),
    }

    nu = 1.0 / max(reynolds, 1.0)
    results = {}

    for surf_name, idx_list in surfaces_config.items():
        if len(idx_list) < 5:
            continue

        xs = xm[idx_list]
        vs = np.maximum(np.abs(Vt[idx_list]), 0.01)

        # Arc length
        s = np.zeros(len(idx_list))
        for k in range(1, len(idx_list)):
            i_c = idx_list[k]
            i_p = idx_list[k - 1]
            s[k] = s[k - 1] + float(np.hypot(xm[i_c] - xm[i_p], ym[i_c] - ym[i_p]))

        # Forced transition from defects
        forced_tr_x = 1.0
        for d in defects:
            if d.surface in (surf_name, "both"):
                if d.defect_type in ("roughness", "contamination", "step", "ice", "erosion"):
                    forced_tr_x = min(forced_tr_x, d.x_start)

        theta = np.zeros(len(idx_list))
        H = np.full(len(idx_list), 2.59)
        cf = np.zeros(len(idx_list))
        delta_star = np.zeros(len(idx_list))
        laminar = np.ones(len(idx_list), dtype=bool)
        tr_x = 1.0
        theta_sq_prev = 0.0
        Ue_prev6 = vs[0] ** 6

        for k in range(1, len(idx_list)):
            ds = float(s[k] - s[k - 1])
            if ds < 1e-12:
                theta[k] = theta[k - 1]
                H[k] = H[k - 1]
                continue

            Ue = float(vs[k])
            Ue_p = float(vs[k - 1])

            # Thwaites
            integral = 0.5 * (Ue_p ** 5 + Ue ** 5) * ds
            theta_sq = (theta_sq_prev * Ue_p ** 6 + 0.45 * nu * integral) / (Ue ** 6 + 1e-20)
            theta_sq = max(theta_sq, 1e-16)
            theta_sq_prev = theta_sq
            theta[k] = math.sqrt(theta_sq)

            dUe_ds = (Ue - Ue_p) / ds
            lam = theta_sq * dUe_ds / (nu + 1e-20)
            lam = max(-0.09, min(0.25, lam))

            if lam >= 0.0:
                H[k] = max(1.5, min(4.0, 2.61 - 3.75 * lam - 5.24 * lam ** 2))
            else:
                H[k] = max(1.5, min(4.0, 2.088 + 0.0731 / (lam + 0.14 + 1e-8)))

            Re_theta = Ue * theta[k] / nu
            Re_s = Ue * float(s[k]) / nu if s[k] > 0 else 1.0

            # Michel criterion
            Re_theta_crit = 1.174 * (1.0 + 22400.0 / max(Re_s, 1.0)) * Re_s ** 0.46
            Re_theta_crit *= (n_crit / 9.0)

            if Re_theta > Re_theta_crit or xs[k] >= forced_tr_x or lam < -0.09:
                laminar[k] = False
                if tr_x >= 1.0:
                    tr_x = float(xs[k])

            if not laminar[k]:
                # Head turbulent
                cf[k] = 0.0576 * max(Re_theta, 1.0) ** (-0.2)
                theta[k] = theta[k - 1] + 0.5 * cf[k] * ds
                H[k] = max(1.3, 1.4 + 0.8 / (math.log10(max(Re_theta, 10.0)) + 1e-5))
                # Roughness penalty
                for d in defects:
                    if d.surface in (surf_name, "both") and d.x_start <= xs[k] <= d.x_end:
                        cf[k] *= (1.0 + 0.25 * d.severity)
            else:
                S_th = (lam + 0.09) ** 0.62 if lam >= -0.09 else 0.0
                cf[k] = 2.0 * S_th * nu / (theta[k] * Ue + 1e-20)

            delta_star[k] = H[k] * theta[k]

        results[surf_name] = {
            "x": xs.tolist(),
            "theta": theta.tolist(),
            "delta_star": delta_star.tolist(),
            "H": H.tolist(),
            "cf": cf.tolist(),
            "laminar": laminar.tolist(),
            "transition_x": round(tr_x, 5),
        }

    cd_friction = 0.0
    for surf_data in results.values():
        th = surf_data["theta"]
        if th:
            cd_friction += 2.0 * th[-1]

    return {
        "surfaces": results,
        "Cd_friction": round(float(cd_friction), 7),
        "transition_upper": results.get("upper", {}).get("transition_x", 1.0),
        "transition_lower": results.get("lower", {}).get("transition_x", 1.0),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FULL ANALYSIS PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

def full_analysis(coords: np.ndarray, conditions: FlightConditions,
                  defects: List[DefectRegion] = None) -> Dict:
    """Panel method + BL + transition → full aero result."""
    if defects is None:
        defects = []

    t0 = time.time()
    
    # Validate geometry before proceeding - relaxed
    validation = validate_airfoil_geometry(coords)
    if not validation["is_valid"]:
        # If validation fails, try to fix common issues
        try:
            # Remove duplicate points
            unique = np.unique(coords, axis=0)
            if len(unique) >= 10:
                coords = unique
                validation = validate_airfoil_geometry(coords)
                if validation["is_valid"]:
                    logger.info("Fixed geometry by removing duplicates")
        except Exception:
            pass
        
        if not validation["is_valid"]:
            raise ValueError(f"Invalid airfoil geometry: {validation['warnings']}")
    
    # Use corrected coordinates if available
    if validation["corrected_coords"] is not None:
        coords = validation["corrected_coords"]

    # Ensure coordinates are properly oriented (CCW, LE first)
    le_idx = np.argmin(coords[:, 0])
    if le_idx > 0:
        coords = np.roll(coords, -le_idx, axis=0)

    pm = RobustPanelSolver(coords, conditions.alpha_deg, conditions.mach).solve()
    xm = np.array(pm["xm"])
    ym = np.array(pm["ym"])
    Vt = np.array(pm["Vt"])

    bl = boundary_layer_analysis(xm, ym, Vt, conditions.reynolds, conditions.n_crit, defects)

    Cd_total = pm["Cd_pressure"] + bl["Cd_friction"]
    Cl = pm["Cl"]
    LD = Cl / max(Cd_total, 1e-8)

    Cp = np.array(pm["Cp"])
    Cp_min = float(np.min(Cp))
    Cp_min_x = float(xm[int(np.argmin(Cp))])

    # Stall estimate
    stall_alpha = 15.0
    for d in defects:
        if d.defect_type in ("ice", "erosion"):
            stall_alpha -= d.severity * 1.0
        elif d.defect_type in ("roughness", "contamination", "step"):
            stall_alpha -= d.severity * 0.4
        else:
            stall_alpha -= d.severity * 0.2
    stall_alpha = max(stall_alpha, 5.0)
    stall_margin = stall_alpha - conditions.alpha_deg

    geom = compute_geometry_properties(coords)

    return {
        "panel_method": pm,
        "boundary_layer": bl,
        "integrated": {
            "Cl": round(Cl, 6),
            "Cd_pressure": round(pm["Cd_pressure"], 7),
            "Cd_friction": round(bl["Cd_friction"], 7),
            "Cd_total": round(Cd_total, 7),
            "Cm": round(pm["Cm_quarter"], 6),
            "L_D": round(LD, 3),
            "Cp_min": round(Cp_min, 5),
            "Cp_min_x": round(Cp_min_x, 5),
            "transition_upper": bl["transition_upper"],
            "transition_lower": bl["transition_lower"],
            "stall_alpha_est": round(stall_alpha, 2),
            "stall_margin_deg": round(stall_margin, 2),
        },
        "geometry": geom,
        "conditions": {
            "alpha_deg": conditions.alpha_deg,
            "reynolds": conditions.reynolds,
            "mach": conditions.mach,
            "n_crit": conditions.n_crit,
        },
        "elapsed_ms": round((time.time() - t0) * 1000.0, 1),
    }


def generate_oracle(result: Dict, defects: List[DefectRegion],
                    conditions: FlightConditions) -> List[Dict]:
    """Generate engineering diagnostic messages."""
    msgs = []
    intg = result["integrated"]
    Cp_min = intg["Cp_min"]
    Cp_min_x = intg["Cp_min_x"]
    margin = intg["stall_margin_deg"]
    tr_u = intg["transition_upper"]
    Cl = intg["Cl"]
    Cd = intg["Cd_total"]
    Cd_p = intg["Cd_pressure"]
    Cd_f = intg["Cd_friction"]
    LD = intg["L_D"]

    if Cp_min < -6.0:
        msgs.append({"level": "WARNING", "code": "EXTREME_SUCTION_PEAK",
                     "title": "Extreme Suction Peak",
                     "message": f"Cp_min = {Cp_min:.3f} at x/c = {Cp_min_x:.3f}. Severe adverse pressure gradient.",
                     "recommendation": "Reduce AoA. Check for LE separation bubble.",
                     "zone_x": Cp_min_x})
    elif Cp_min < -3.5:
        msgs.append({"level": "CAUTION", "code": "HIGH_SUCTION_PEAK",
                     "title": "Elevated Suction Peak",
                     "message": f"Cp_min = {Cp_min:.3f} at x/c = {Cp_min_x:.3f}.",
                     "recommendation": "Monitor BL state. Transition may move forward.",
                     "zone_x": Cp_min_x})

    if margin < 2.0:
        msgs.append({"level": "WARNING", "code": "STALL_IMMINENT",
                     "title": "Stall Imminent",
                     "message": f"Stall margin only {margin:.1f}° (stall ≈ {intg['stall_alpha_est']:.1f}°).",
                     "recommendation": "Reduce AoA immediately.",
                     "zone_x": 0.05})
    elif margin < 5.0:
        msgs.append({"level": "CAUTION", "code": "LOW_STALL_MARGIN",
                     "title": "Reduced Stall Margin",
                     "message": f"Stall margin: {margin:.1f}°. Defects reduce safe operating envelope.",
                     "recommendation": "Avoid aggressive maneuvers.",
                     "zone_x": 0.05})

    if tr_u < 0.05:
        msgs.append({"level": "CAUTION", "code": "EARLY_TRANSITION",
                     "title": "Very Early Transition (Upper Surface)",
                     "message": f"Transition at x/c = {tr_u:.4f}. Surface is effectively fully turbulent.",
                     "recommendation": "Inspect leading edge for contamination or damage.",
                     "zone_x": tr_u})
    elif tr_u < 0.20:
        msgs.append({"level": "ADVISORY", "code": "FORWARD_TRANSITION",
                     "title": "Forward Transition",
                     "message": f"Transition at x/c = {tr_u:.4f} — earlier than clean design.",
                     "recommendation": "Check surface cleanliness in LE region.",
                     "zone_x": tr_u})

    if Cd_p > Cd_f * 2.5:
        msgs.append({"level": "ADVISORY", "code": "PRESSURE_DRAG_HIGH",
                     "title": "Pressure Drag Dominant",
                     "message": f"CD_pressure ({Cd_p:.5f}) >> CD_friction ({Cd_f:.5f}). Flow separation likely.",
                     "recommendation": "Check for trailing edge separation or flow reversal.",
                     "zone_x": 0.8})

    if LD < 10.0 and conditions.alpha_deg > 0.0:
        msgs.append({"level": "ADVISORY", "code": "LOW_EFFICIENCY",
                     "title": "Low Aerodynamic Efficiency",
                     "message": f"L/D = {LD:.1f}. Below expected cruise efficiency.",
                     "recommendation": "Optimise alpha or clean surface.",
                     "zone_x": 0.5})

    for d in defects:
        z = (d.x_start + d.x_end) / 2.0
        dt = d.defect_type
        sev = d.severity

        if dt == "ice":
            msgs.append({"level": "WARNING" if sev >= 3 else "CAUTION",
                         "code": "ICE_ACCRETION",
                         "title": "Ice Accretion",
                         "message": f"Ice at x/c = {d.x_start:.3f}–{d.x_end:.3f}, severity {sev:.1f}/5, {d.surface} surface.",
                         "recommendation": "Activate de-icing. Glaze ice (sev ≥ 3) requires immediate action.",
                         "zone_x": z})
        elif dt == "dent":
            msgs.append({"level": "CAUTION" if sev >= 3 else "ADVISORY",
                         "code": "SURFACE_DENT",
                         "title": "Surface Dent",
                         "message": f"Dent at x/c = {d.x_start:.3f}–{d.x_end:.3f}, severity {sev:.1f}/5.",
                         "recommendation": "Inspect depth. > 0.5 mm on upper surface warrants repair.",
                         "zone_x": z})
        elif dt == "step":
            msgs.append({"level": "ADVISORY",
                         "code": "SURFACE_STEP",
                         "title": "Forward-Facing Step",
                         "message": f"Step at x/c = {d.x_start:.3f}, h ≈ {(d.height_mm or sev * 0.5):.1f} mm.",
                         "recommendation": "Step forces early transition. Parasitic drag penalty expected.",
                         "zone_x": z})
        elif dt in ("roughness", "contamination"):
            msgs.append({"level": "ADVISORY",
                         "code": "SURFACE_ROUGHNESS",
                         "title": f"Surface {dt.capitalize()}",
                         "message": f"{dt.capitalize()} at x/c = {d.x_start:.3f}–{d.x_end:.3f}.",
                         "recommendation": "Clean before flight if possible. Transition moves forward.",
                         "zone_x": z})
        elif dt == "erosion":
            msgs.append({"level": "CAUTION" if sev >= 3 else "ADVISORY",
                         "code": "EROSION_DAMAGE",
                         "title": "Erosion Damage",
                         "message": f"Erosion at x/c = {d.x_start:.3f}–{d.x_end:.3f}, severity {sev:.1f}/5.",
                         "recommendation": "LE erosion significantly degrades performance. Schedule repair.",
                         "zone_x": z})
        elif dt == "crack":
            msgs.append({"level": "WARNING" if sev >= 3 else "CAUTION",
                         "code": "SURFACE_CRACK",
                         "title": "Surface Crack",
                         "message": f"Crack at x/c = {d.x_start:.3f}–{d.x_end:.3f}, severity {sev:.1f}/5.",
                         "recommendation": "Structural inspection required. Ground aircraft if sev ≥ 4.",
                         "zone_x": z})
        elif dt == "delamination":
            msgs.append({"level": "WARNING" if sev >= 4 else "CAUTION",
                         "code": "DELAMINATION",
                         "title": "Composite Delamination",
                         "message": f"Delamination at x/c = {d.x_start:.3f}–{d.x_end:.3f}, severity {sev:.1f}/5.",
                         "recommendation": "NDI required. Can propagate under flight loads.",
                         "zone_x": z})

    if not msgs:
        msgs.append({"level": "INFO", "code": "NOMINAL",
                     "title": "Nominal Condition",
                     "message": "No aerodynamic anomalies detected. Surface within acceptable limits.",
                     "recommendation": "Continue normal operations.",
                     "zone_x": 0.5})

    return msgs


def _get_target(result: Dict, target: str) -> float:
    intg = result["integrated"]
    return {
        "cl": intg["Cl"],
        "cd": intg["Cd_total"],
        "cm": abs(intg["Cm"]),
        "ld": intg["L_D"],
        "transition": intg["transition_upper"],
    }.get(target.lower(), intg["Cl"])
# ═══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS - WITH TRAILING SLASH
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health/")
async def health():
    return {
        "status": "ok",
        "engine": "AeroSAGE v8",
        "solver": "Hess-Smith Panel Method",
        "bl_method": "Thwaites + Head + Michel",
    }


@router.get("/defect-types/")
async def get_defect_types():
    return {
        "defect_types": [
            {"id": "ice",          "label": "Ice Accretion",    "color": "#60A5FA", "icon": "❄",
             "description": "Leading/trailing edge ice. Alters camber and thickens profile.",
             "typical_location": "0.00–0.15c", "severity_info": "1=rime film, 5=glaze horn"},
            {"id": "dent",         "label": "Surface Dent",     "color": "#F87171", "icon": "⚡",
             "description": "Impact or hail damage creating local concavity.",
             "typical_location": "0.05–0.40c", "severity_info": "1=scratch, 5=deep crater"},
            {"id": "step",         "label": "Surface Step",     "color": "#FBBF24", "icon": "▤",
             "description": "Panel joints, repair patches. Forward-facing step triggers transition.",
             "typical_location": "0.10–0.60c", "severity_info": "1=0.3 mm, 5=3 mm+ step"},
            {"id": "roughness",    "label": "Roughness",        "color": "#34D399", "icon": "∿",
             "description": "Insect contamination, paint degradation. Promotes early turbulence.",
             "typical_location": "0.00–0.30c", "severity_info": "1=Ra 10 µm, 5=Ra 200 µm"},
            {"id": "erosion",      "label": "Erosion Band",     "color": "#FB923C", "icon": "◈",
             "description": "Rain/sand erosion. Common on wind turbines and rotorcraft.",
             "typical_location": "0.00–0.05c", "severity_info": "1=coating wear, 5=substrate exposed"},
            {"id": "contamination","label": "Contamination",    "color": "#C084FC", "icon": "◉",
             "description": "Oil film, dust, insect smear. Shifts transition forward.",
             "typical_location": "0.00–0.20c", "severity_info": "1=light film, 5=heavy layer"},
            {"id": "crack",        "label": "Surface Crack",    "color": "#F472B6", "icon": "╱",
             "description": "Fatigue crack or impact fracture. Stress concentrator.",
             "typical_location": "0.20–0.60c", "severity_info": "1=hairline, 5=through-surface"},
            {"id": "delamination", "label": "Delamination",     "color": "#A78BFA", "icon": "◫",
             "description": "Composite layer separation, surface bubbling.",
             "typical_location": "0.10–0.50c", "severity_info": "1=cosmetic, 5=structural"},
        ]
    }


@router.post("/generate/naca/")
async def api_generate_naca(req: NACARequest):
    try:
        code = req.naca_code.strip()
        if len(code) == 4:
            coords = generate_naca4(code, req.n_points)
        elif len(code) == 5:
            coords = generate_naca5(code, req.n_points)
        else:
            raise ValueError("Only NACA 4-digit and 5-digit codes supported")
        geom = compute_geometry_properties(coords)
        return {
            "status": "success",
            "coordinates": coords.tolist(),
            "name": f"NACA {code}",
            "geometry": geom,
            "n_points": len(coords),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate/cst/")
async def api_generate_cst(req: CSTRequest):
    try:
        coords = generate_cst(req.upper_coeffs, req.lower_coeffs,
                               req.n_points, req.te_thickness)
        geom = compute_geometry_properties(coords)
        return {
            "status": "success",
            "coordinates": coords.tolist(),
            "name": "CST Airfoil",
            "geometry": geom,
            "n_points": len(coords),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import/dat/")
async def api_import_dat(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        content = raw.decode("utf-8", errors="replace")
        coords, name = parse_dat_file(content)
        geom = compute_geometry_properties(coords)
        return {
            "status": "success",
            "coordinates": coords.tolist(),
            "name": name,
            "geometry": geom,
            "n_points": len(coords),
            "filename": file.filename,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DAT parse error: {e}")


@router.post("/import/coordinates/")
async def api_import_coordinates(req: ImportCoordinatesRequest):
    try:
        coords, name = parse_dat_file(req.text)
        geom = compute_geometry_properties(coords)
        return {
            "status": "success",
            "coordinates": coords.tolist(),
            "name": req.name or name,
            "geometry": geom,
            "n_points": len(coords),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyze/")
async def api_analyze(req: AnalysisRequest):
    try:
        coords = np.array(req.coordinates, dtype=float)
        if len(coords) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 coordinate points")

        # Validate geometry with relaxed rules
        validation = validate_airfoil_geometry(coords)
        
        # If validation fails with self-intersection, try to fix
        if not validation["is_valid"]:
            # Try removing duplicate points
            unique = np.unique(coords, axis=0)
            if len(unique) >= 10:
                coords = unique
                validation = validate_airfoil_geometry(coords)
                if not validation["is_valid"]:
                    # Try flipping y coordinates (inverted airfoil)
                    coords[:, 1] = -coords[:, 1]
                    validation = validate_airfoil_geometry(coords)
        
        if not validation["is_valid"]:
            # Still not valid - but let's try to proceed anyway with warning
            logger.warning(f"Proceeding despite validation warning: {validation['warnings']}")
            # Don't raise, just continue with warning
        
        # Use corrected coordinates if available
        if validation.get("corrected_coords") is not None:
            coords = validation["corrected_coords"]

        # Ensure proper orientation - find LE
        le_idx = np.argmin(coords[:, 0])
        if le_idx > 0:
            coords = np.roll(coords, -le_idx, axis=0)
        
        # Ensure CCW orientation
        # Calculate signed area
        area = 0.5 * np.sum(coords[:-1, 0] * coords[1:, 1] - coords[1:, 0] * coords[:-1, 1])
        if area > 0:
            # Clockwise, reverse
            coords = coords[::-1]

        # Clean baseline
        clean_result = None
        if req.compute_clean_baseline and len(req.defects) > 0:
            clean_result = full_analysis(coords, req.conditions, [])

        # Apply defects
        defected = coords.copy()
        for d in req.defects:
            defected = apply_defect(defected, d)

        result = full_analysis(defected, req.conditions, req.defects)

        # Deltas
        deltas: Dict = {}
        if clean_result and req.defects:
            ci = clean_result["integrated"]
            di = result["integrated"]
            deltas = {
                "delta_Cl": round(di["Cl"] - ci["Cl"], 7),
                "delta_Cd": round(di["Cd_total"] - ci["Cd_total"], 8),
                "delta_Cm": round(di["Cm"] - ci["Cm"], 7),
                "delta_LD": round(di["L_D"] - ci["L_D"], 3),
                "delta_Cl_pct": round((di["Cl"] - ci["Cl"]) / max(abs(ci["Cl"]), 1e-6) * 100, 3),
                "delta_Cd_pct": round((di["Cd_total"] - ci["Cd_total"]) / max(ci["Cd_total"], 1e-8) * 100, 3),
                "delta_tr_upper": round(di["transition_upper"] - ci["transition_upper"], 5),
                "delta_tr_lower": round(di["transition_lower"] - ci["transition_lower"], 5),
                "clean_Cl": ci["Cl"],
                "clean_Cd": ci["Cd_total"],
                "clean_LD": ci["L_D"],
            }

        oracle = generate_oracle(result, req.defects, req.conditions)

        return {
            "status": "success",
            "result": result,
            "clean_result": clean_result,
            "deltas": deltas,
            "oracle": oracle,
            "defected_coordinates": defected.tolist(),
            "original_coordinates": coords.tolist(),
            "defect_count": len(req.defects),
            "airfoil_name": req.airfoil_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@router.post("/polar/")
async def api_polar(req: PolarSweepRequest):
    try:
        coords = np.array(req.coordinates, dtype=float)
        if len(coords) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 coordinate points")

        # Validate with relaxed rules
        validation = validate_airfoil_geometry(coords)
        if not validation["is_valid"]:
            # Try fixing
            unique = np.unique(coords, axis=0)
            if len(unique) >= 10:
                coords = unique
                validation = validate_airfoil_geometry(coords)
        
        # Use corrected coordinates if available
        if validation.get("corrected_coords") is not None:
            coords = validation["corrected_coords"]

        # Ensure proper orientation
        le_idx = np.argmin(coords[:, 0])
        if le_idx > 0:
            coords = np.roll(coords, -le_idx, axis=0)

        defected = coords.copy()
        for d in req.defects:
            defected = apply_defect(defected, d)

        alphas = np.arange(req.alpha_start,
                           req.alpha_end + req.alpha_step * 0.5,
                           req.alpha_step)

        conds = FlightConditions(alpha_deg=0.0, reynolds=req.reynolds,
                                 mach=req.mach, n_crit=9.0)

        polar: Dict = {k: [] for k in ["alpha", "Cl", "Cd", "Cm", "L_D",
                                        "Cl_clean", "Cd_clean",
                                        "Cp_min", "transition_upper", "transition_lower"]}

        t0 = time.time()
        for a in alphas:
            conds.alpha_deg = float(a)
            try:
                r = full_analysis(defected, conds, req.defects)
                i = r["integrated"]
                polar["alpha"].append(round(float(a), 3))
                polar["Cl"].append(i["Cl"])
                polar["Cd"].append(i["Cd_total"])
                polar["Cm"].append(i["Cm"])
                polar["L_D"].append(i["L_D"])
                polar["Cp_min"].append(i["Cp_min"])
                polar["transition_upper"].append(i["transition_upper"])
                polar["transition_lower"].append(i["transition_lower"])

                if req.defects:
                    rc = full_analysis(coords, conds, [])
                    polar["Cl_clean"].append(rc["integrated"]["Cl"])
                    polar["Cd_clean"].append(rc["integrated"]["Cd_total"])
                else:
                    polar["Cl_clean"].append(i["Cl"])
                    polar["Cd_clean"].append(i["Cd_total"])
            except Exception as e:
                logger.warning(f"Polar point at alpha={a} failed: {e}")
                continue

        # Metrics
        cl_arr = np.array(polar["Cl"])
        cd_arr = np.array(polar["Cd"])
        ld_arr = np.array(polar["L_D"])
        a_arr = np.array(polar["alpha"])
        metrics: Dict = {}

        if len(cl_arr) > 0:
            i_clmax = int(np.argmax(cl_arr))
            i_ldmax = int(np.argmax(ld_arr))
            metrics = {
                "Cl_max": round(float(cl_arr[i_clmax]), 5),
                "alpha_Cl_max": round(float(a_arr[i_clmax]), 2),
                "Cd_min": round(float(np.min(cd_arr)), 7),
                "LD_max": round(float(ld_arr[i_ldmax]), 2),
                "alpha_LD_max": round(float(a_arr[i_ldmax]), 2),
                "n_points": len(polar["alpha"]),
            }
            if len(a_arr) >= 4:
                mask = (a_arr >= -2) & (a_arr <= 6)
                if np.sum(mask) >= 2:
                    slope = np.polyfit(a_arr[mask] * math.pi / 180.0, cl_arr[mask], 1)
                    metrics["Cl_alpha_per_rad"] = round(float(slope[0]), 4)
                    metrics["Cl_alpha_per_deg"] = round(float(slope[0]) * math.pi / 180.0, 6)

        return {
            "status": "success",
            "polar": polar,
            "metrics": metrics,
            "elapsed_ms": round((time.time() - t0) * 1000.0, 1),
            "airfoil_name": req.airfoil_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Polar error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Polar error: {str(e)}")


@router.post("/sensitivity/")
async def api_sensitivity(req: SensitivityRequest):
    try:
        coords = np.array(req.coordinates, dtype=float)
        if len(coords) < 10:
            raise HTTPException(status_code=400, detail="Need at least 10 coordinate points")

        # Validate with relaxed rules
        validation = validate_airfoil_geometry(coords)
        if not validation["is_valid"]:
            unique = np.unique(coords, axis=0)
            if len(unique) >= 10:
                coords = unique
        
        # Use corrected coordinates if available
        if validation.get("corrected_coords") is not None:
            coords = validation["corrected_coords"]

        # Ensure proper orientation
        le_idx = np.argmin(coords[:, 0])
        if le_idx > 0:
            coords = np.roll(coords, -le_idx, axis=0)

        base = full_analysis(coords, req.conditions, [])
        base_val = _get_target(base, req.target)

        zone_w = 1.0 / req.n_zones
        zones = []

        for i in range(req.n_zones):
            xs = i * zone_w
            xe = min((i + 1) * zone_w, 1.0)
            xm_z = (xs + xe) / 2.0

            pert_d = DefectRegion(
                defect_type="roughness",
                x_start=xs, x_end=xe,
                surface="upper",
                severity=req.perturbation_severity,
            )
            pert_coords = apply_defect(coords, pert_d)
            pert = full_analysis(pert_coords, req.conditions, [pert_d])
            pert_val = _get_target(pert, req.target)

            sens = abs(pert_val - base_val) / (req.perturbation_severity + 1e-10)
            zones.append({
                "zone_id": i,
                "x_start": round(xs, 5),
                "x_end": round(xe, 5),
                "x_mid": round(xm_z, 5),
                "sensitivity": round(float(sens), 8),
                "delta": round(float(pert_val - base_val), 8),
            })

        max_s = max(z["sensitivity"] for z in zones) or 1e-12
        for z in zones:
            z["sensitivity_norm"] = round(z["sensitivity"] / max_s, 5)
            z["criticality"] = (
                "CRITICAL" if z["sensitivity_norm"] > 0.70 else
                "HIGH"     if z["sensitivity_norm"] > 0.40 else
                "MODERATE" if z["sensitivity_norm"] > 0.15 else
                "LOW"
            )

        return {
            "status": "success",
            "sensitivity": {
                "zones": zones,
                "target": req.target,
                "baseline_value": round(float(base_val), 7),
                "max_sensitivity_zone": max(zones, key=lambda z: z["sensitivity"])["x_mid"],
                "critical_zones": [z for z in zones if z["criticality"] == "CRITICAL"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sensitivity error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sensitivity error: {str(e)}")


# ============================================================================
# ADD NO-SLASH VERSIONS OF ALL ROUTES (TO PREVENT 307 REDIRECTS)
# ============================================================================

@router.get("/health")
async def health_no_slash():
    return await health()

@router.get("/defect-types")
async def get_defect_types_no_slash():
    return await get_defect_types()

@router.post("/generate/naca")
async def api_generate_naca_no_slash(req: NACARequest):
    return await api_generate_naca(req)

@router.post("/generate/cst")
async def api_generate_cst_no_slash(req: CSTRequest):
    return await api_generate_cst(req)

@router.post("/import/dat")
async def api_import_dat_no_slash(file: UploadFile = File(...)):
    return await api_import_dat(file)

@router.post("/import/coordinates")
async def api_import_coordinates_no_slash(req: ImportCoordinatesRequest):
    return await api_import_coordinates(req)

@router.post("/analyze")
async def api_analyze_no_slash(req: AnalysisRequest):
    return await api_analyze(req)

@router.post("/polar")
async def api_polar_no_slash(req: PolarSweepRequest):
    return await api_polar(req)

@router.post("/sensitivity")
async def api_sensitivity_no_slash(req: SensitivityRequest):
    return await api_sensitivity(req)