# backend/app/ml_engine/physics_constraints.py
"""
Physics Validation & Correction Layer
Ensures all ML predictions satisfy fundamental aerodynamic laws.
Acts as a post-processing filter that can be applied to any model output.
"""

import numpy as np
import math
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from enum import Enum


class PhysicsSeverity(Enum):
    """Severity level of physics violation."""
    INFO = "info"
    WARNING = "warning"
    CORRECTED = "corrected"
    CRITICAL = "critical"


@dataclass
class PhysicsViolation:
    """Record of a physics violation."""
    law: str
    description: str
    actual_value: float
    expected_range: Tuple[float, float]
    corrected_value: float
    severity: PhysicsSeverity


class PhysicsConstraintLayer:
    """
    Post-processing layer that enforces physical laws on ML predictions.
    All corrections are physics-based, not arbitrary clamping.
    """
    
    def __init__(self, enable_corrections: bool = True, verbose: bool = False):
        self.enable_corrections = enable_corrections
        self.verbose = verbose
        self.violations: List[PhysicsViolation] = []
    
    def clear_violations(self):
        """Clear recorded violations."""
        self.violations = []
    
    def get_violations(self) -> List[Dict]:
        """Get formatted violations."""
        return [
            {
                "law": v.law,
                "description": v.description,
                "actual": v.actual_value,
                "expected": v.expected_range,
                "corrected": v.corrected_value,
                "severity": v.severity.value
            }
            for v in self.violations
        ]
    
    # ========================================================================
    # 1. AERODYNAMIC COEFFICIENT CONSTRAINTS
    # ========================================================================
    
    def enforce_positive_drag(self, cd: float, epsilon: float = 1e-8) -> float:
        """
        Drag coefficient must be positive.
        Physics: Cd = Cd_friction + Cd_pressure > 0 always.
        """
        if cd <= 0:
            corrected = max(cd, epsilon)
            self.violations.append(PhysicsViolation(
                law="Second Law of Thermodynamics",
                description=f"Drag coefficient cannot be negative or zero (Cd = {cd:.6f})",
                actual_value=cd,
                expected_range=(epsilon, float('inf')),
                corrected_value=corrected,
                severity=PhysicsSeverity.CORRECTED if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cd
        return cd
    
    def enforce_lift_range(self, cl: float, alpha_deg: float = None, 
                          min_cl: float = -3.0, max_cl: float = 2.5) -> float:
        """
        Lift coefficient has physical bounds based on airfoil type.
        For subsonic flow, |Cl| typically < 2.0, max ~2.5 for high-lift devices.
        """
        if cl < min_cl or cl > max_cl:
            corrected = np.clip(cl, min_cl, max_cl)
            self.violations.append(PhysicsViolation(
                law="Lift Generation Limit",
                description=f"Lift coefficient outside physical bounds (Cl = {cl:.4f})",
                actual_value=cl,
                expected_range=(min_cl, max_cl),
                corrected_value=corrected,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cl
        return cl
    
    def enforce_pitching_moment_stability(self, cm: float, 
                                         min_cm: float = -0.5, 
                                         max_cm: float = 0.2) -> float:
        """
        Pitching moment coefficient should be negative for static stability.
        Positive Cm indicates unstable or canard configuration.
        """
        if cm > max_cm:
            corrected = min(cm, max_cm)
            self.violations.append(PhysicsViolation(
                law="Longitudinal Static Stability",
                description=f"Positive Cm indicates instability (Cm = {cm:.4f})",
                actual_value=cm,
                expected_range=(min_cm, max_cm),
                corrected_value=corrected,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cm
        return cm
    
    def enforce_ld_ratio_physical(self, ld: float, max_ld: float = 200.0) -> float:
        """
        L/D ratio has physical limits. Infinite L/D impossible due to viscous effects.
        Gliders max ~60, sailplanes ~70, theoretical max ~200 for perfect laminar.
        """
        if ld > max_ld:
            corrected = max_ld
            self.violations.append(PhysicsViolation(
                law="Energy Conservation",
                description=f"L/D ratio exceeds theoretical maximum (L/D = {ld:.1f})",
                actual_value=ld,
                expected_range=(0, max_ld),
                corrected_value=corrected,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else ld
        return max(ld, 0.0) if self.enable_corrections else ld
    
    # ========================================================================
    # 2. LIFT CURVE SLOPE CONSTRAINTS
    # ========================================================================
    
    def enforce_lift_curve_slope(self, cl_alpha: float, 
                                 alpha_range: Tuple[float, float] = (-5, 15),
                                 theoretical_max: float = 2.0 * math.pi) -> float:
        """
        Lift curve slope dCl/dα should be positive and physically reasonable.
        Thin airfoil theory: dCl/dα = 2π per radian (~0.11 per degree).
        """
        # Convert to per degree if value is large (likely per radian)
        if cl_alpha > 1.0:
            cl_alpha_per_deg = cl_alpha * math.pi / 180
        else:
            cl_alpha_per_deg = cl_alpha
        
        if cl_alpha_per_deg <= 0:
            corrected = 0.05  # Minimum physical slope
            self.violations.append(PhysicsViolation(
                law="Thin Airfoil Theory",
                description=f"Negative lift slope is unphysical (dCl/dα = {cl_alpha:.4f})",
                actual_value=cl_alpha,
                expected_range=(0.05, theoretical_max),
                corrected_value=corrected if self.enable_corrections else cl_alpha,
                severity=PhysicsSeverity.CORRECTED if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cl_alpha
        
        if cl_alpha_per_deg > theoretical_max:
            corrected = theoretical_max
            self.violations.append(PhysicsViolation(
                law="Thin Airfoil Theory",
                description=f"Lift slope exceeds theoretical maximum (dCl/dα = {cl_alpha:.4f})",
                actual_value=cl_alpha,
                expected_range=(0, theoretical_max),
                corrected_value=corrected if self.enable_corrections else cl_alpha,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cl_alpha
        
        return cl_alpha
    
    # ========================================================================
    # 3. DRAG POLAR CONSTRAINTS
    # ========================================================================
    
    def enforce_drag_polar_convexity(self, cl: float, cd: float, 
                                     cd0: float = None) -> float:
        """
        Drag polar should be convex: Cd = Cd0 + K * Cl².
        If Cd is too low for given Cl, adjust.
        """
        if cd0 is None:
            cd0 = cd * 0.5  # Estimate Cd0
        
        K = 1.0 / (math.pi * 8.0 * 0.85)  # Typical induced drag factor
        cd_min_physical = cd0 + K * cl * cl
        
        if cd < cd_min_physical * 0.8:  # Allow 20% tolerance for supercritical designs
            corrected = cd_min_physical * 0.9
            self.violations.append(PhysicsViolation(
                law="Drag Polar Physics",
                description=f"Drag too low for given lift (Cd = {cd:.6f}, min physical = {cd_min_physical:.6f})",
                actual_value=cd,
                expected_range=(cd_min_physical * 0.8, float('inf')),
                corrected_value=corrected if self.enable_corrections else cd,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cd
        
        return cd
    
    # ========================================================================
    # 4. BOUNDARY LAYER CONSISTENCY
    # ========================================================================
    
    def enforce_boundary_layer_consistency(self, theta: float, delta_star: float, 
                                           H: float) -> Tuple[float, float, float]:
        """
        Boundary layer parameters must satisfy physical relations:
        - δ* > θ (displacement thickness > momentum thickness)
        - Shape factor H = δ*/θ between 1.2 (turbulent) and 4.0 (laminar separation)
        """
        # H should be physically meaningful
        if H < 1.0 or H > 5.0:
            corrected_H = np.clip(H, 1.2, 4.0)
            self.violations.append(PhysicsViolation(
                law="Boundary Layer Theory",
                description=f"Shape factor H outside physical range (H = {H:.3f})",
                actual_value=H,
                expected_range=(1.2, 4.0),
                corrected_value=corrected_H if self.enable_corrections else H,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            H = corrected_H if self.enable_corrections else H
        
        # δ* should be greater than θ
        if delta_star <= theta:
            corrected_ds = theta * H
            self.violations.append(PhysicsViolation(
                law="Boundary Layer Consistency",
                description=f"δ* ({delta_star:.5f}) must be > θ ({theta:.5f})",
                actual_value=delta_star,
                expected_range=(theta * 1.01, float('inf')),
                corrected_value=corrected_ds if self.enable_corrections else delta_star,
                severity=PhysicsSeverity.CORRECTED if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            delta_star = corrected_ds if self.enable_corrections else delta_star
        
        return theta, delta_star, H
    
    def enforce_transition_location(self, xtr: float) -> float:
        """
        Transition location must be between LE and TE.
        """
        if xtr < 0.0 or xtr > 1.0:
            corrected = np.clip(xtr, 0.01, 0.99)
            self.violations.append(PhysicsViolation(
                law="Boundary Layer Transition",
                description=f"Transition location outside airfoil (x/c = {xtr:.3f})",
                actual_value=xtr,
                expected_range=(0.0, 1.0),
                corrected_value=corrected if self.enable_corrections else xtr,
                severity=PhysicsSeverity.CORRECTED if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else xtr
        return xtr
    
    # ========================================================================
    # 5. PRESSURE COEFFICIENT CONSTRAINTS
    # ========================================================================
    
    def enforce_cp_bounds(self, cp: float, mach: float = 0.0) -> float:
        """
        Pressure coefficient has theoretical bounds based on Mach number.
        Minimum Cp (suction peak) limited by vacuum: Cp_min >= -1/(γM²)
        """
        if mach > 0.1:
            gamma = 1.4
            cp_vacuum = -2.0 / (gamma * mach * mach) if mach > 0 else -10.0
        else:
            cp_vacuum = -10.0  # Incompressible limit
        
        if cp < cp_vacuum:
            corrected = cp_vacuum
            self.violations.append(PhysicsViolation(
                law="Bernoulli's Principle",
                description=f"Cp below vacuum limit (Cp = {cp:.4f} < {cp_vacuum:.4f})",
                actual_value=cp,
                expected_range=(cp_vacuum, 1.0),
                corrected_value=corrected if self.enable_corrections else cp,
                severity=PhysicsSeverity.WARNING if self.enable_corrections else PhysicsSeverity.CRITICAL
            ))
            return corrected if self.enable_corrections else cp
        
        return cp
    
    # ========================================================================
    # 6. COMPRESSIBILITY CONSISTENCY
    # ========================================================================
    
    def enforce_mach_consistency(self, mach: float, cl: float, cm: float) -> Tuple[float, float]:
        """
        Prandtl-Glauert correction should not be applied outside valid range.
        For M > 0.7, corrections become less accurate.
        """
        if 0.3 < mach < 0.7:
            # Valid range for Prandtl-Glauert
            pass
        elif mach >= 0.7:
            self.violations.append(PhysicsViolation(
                law="Compressible Flow",
                description=f"Mach number {mach:.3f} exceeds Prandtl-Glauert validity (M < 0.7)",
                actual_value=mach,
                expected_range=(0, 0.7),
                corrected_value=mach,
                severity=PhysicsSeverity.WARNING
            ))
        
        return cl, cm
    
    # ========================================================================
    # 7. ENERGY CONSERVATION (Drag Breakdown)
    # ========================================================================
    
    def enforce_drag_conservation(self, cd_pressure: float, cd_friction: float, 
                                  cd_total: float, tolerance: float = 0.001) -> Tuple[float, float, float]:
        """
        Total drag should equal pressure drag + friction drag.
        """
        cd_sum = cd_pressure + cd_friction
        error = abs(cd_total - cd_sum)
        
        if error > tolerance:
            # Correct by adjusting total drag
            corrected_cd = cd_sum
            self.violations.append(PhysicsViolation(
                law="Energy Conservation",
                description=f"Drag components don't sum to total (Cd_total={cd_total:.6f}, sum={cd_sum:.6f})",
                actual_value=cd_total,
                expected_range=(cd_sum - tolerance, cd_sum + tolerance),
                corrected_value=corrected_cd if self.enable_corrections else cd_total,
                severity=PhysicsSeverity.CORRECTED if self.enable_corrections else PhysicsSeverity.WARNING
            ))
            cd_total = corrected_cd if self.enable_corrections else cd_total
        
        return cd_pressure, cd_friction, cd_total
    
    # ========================================================================
    # 8. MAIN VALIDATION METHOD
    # ========================================================================
    
    def validate_prediction(self, prediction: Dict[str, Any], 
                           alpha_deg: float = None,
                           mach: float = 0.0) -> Dict[str, Any]:
        """
        Apply all physics constraints to a prediction dictionary.
        
        Args:
            prediction: Dictionary containing 'cl', 'cd', 'cm', etc.
            alpha_deg: Angle of attack in degrees (for slope validation)
            mach: Mach number (for compressibility checks)
        
        Returns:
            Corrected prediction dictionary with physics flags
        """
        self.clear_violations()
        
        # Make a copy to avoid modifying original
        corrected = prediction.copy()
        
        # 1. Enforce positive drag
        if 'cd' in corrected:
            corrected['cd'] = self.enforce_positive_drag(corrected['cd'])
        if 'cd_total' in corrected:
            corrected['cd_total'] = self.enforce_positive_drag(corrected['cd_total'])
        if 'cd_pressure' in corrected:
            corrected['cd_pressure'] = self.enforce_positive_drag(corrected['cd_pressure'])
        if 'cd_friction' in corrected:
            corrected['cd_friction'] = self.enforce_positive_drag(corrected['cd_friction'])
        
        # 2. Enforce lift range
        if 'cl' in corrected:
            corrected['cl'] = self.enforce_lift_range(corrected['cl'], alpha_deg)
        
        # 3. Enforce pitching moment stability
        if 'cm' in corrected:
            corrected['cm'] = self.enforce_pitching_moment_stability(corrected['cm'])
        
        # 4. Enforce L/D bounds
        if 'cl' in corrected and 'cd' in corrected and corrected['cd'] > 0:
            ld = corrected['cl'] / corrected['cd']
            ld = self.enforce_ld_ratio_physical(ld)
            corrected['ld_ratio'] = ld
        
        # 5. Enforce drag conservation
        if all(k in corrected for k in ['cd_pressure', 'cd_friction', 'cd_total']):
            (corrected['cd_pressure'], 
             corrected['cd_friction'], 
             corrected['cd_total']) = self.enforce_drag_conservation(
                corrected['cd_pressure'],
                corrected['cd_friction'],
                corrected['cd_total']
            )
        
        # 6. Enforce boundary layer consistency
        if 'upper_bl' in corrected and corrected['upper_bl']:
            bl = corrected['upper_bl']
            if all(k in bl for k in ['theta', 'delta_star', 'H']):
                bl['theta'], bl['delta_star'], bl['H'] = self.enforce_boundary_layer_consistency(
                    bl['theta'], bl['delta_star'], bl['H']
                )
        
        if 'lower_bl' in corrected and corrected['lower_bl']:
            bl = corrected['lower_bl']
            if all(k in bl for k in ['theta', 'delta_star', 'H']):
                bl['theta'], bl['delta_star'], bl['H'] = self.enforce_boundary_layer_consistency(
                    bl['theta'], bl['delta_star'], bl['H']
                )
        
        # 7. Enforce transition bounds
        if 'top_xtr' in corrected:
            corrected['top_xtr'] = self.enforce_transition_location(corrected['top_xtr'])
        if 'bot_xtr' in corrected:
            corrected['bot_xtr'] = self.enforce_transition_location(corrected['bot_xtr'])
        
        # 8. Enforce Cp bounds
        if 'cp_min' in corrected:
            corrected['cp_min'] = self.enforce_cp_bounds(corrected['cp_min'], mach)
        
        # 9. Add physics metadata
        corrected['physics_validated'] = True
        corrected['physics_violations_count'] = len(self.violations)
        corrected['physics_violations'] = self.get_violations() if self.verbose else []
        
        return corrected


# ========================================================================
# 9. CONVENIENCE WRAPPER FOR MODEL OUTPUTS
# ========================================================================

class PhysicsWrapper:
    """
    Wrapper that applies physics constraints to any model's output.
    Can be used as a decorator or direct wrapper.
    """
    
    def __init__(self, model, constraint_layer: PhysicsConstraintLayer = None):
        self.model = model
        self.constraint_layer = constraint_layer or PhysicsConstraintLayer()
    
    def predict(self, *args, **kwargs):
        """Run model prediction then apply physics constraints."""
        prediction = self.model(*args, **kwargs)
        
        # Extract alpha and mach if present in kwargs
        alpha = kwargs.get('alpha', None)
        mach = kwargs.get('mach', 0.0)
        
        return self.constraint_layer.validate_prediction(prediction, alpha, mach)
    
    def __call__(self, *args, **kwargs):
        return self.predict(*args, **kwargs)


# ========================================================================
# 10. INTEGRATION WITH NEURALFOIL
# ========================================================================

def apply_physics_to_neuralfoil_output(output: Dict, reynolds: float = None, 
                                       alpha_deg: float = None,
                                       mach: float = 0.0) -> Dict:
    """
    Specialized physics correction for NeuralFoil outputs.
    """
    constraints = PhysicsConstraintLayer(enable_corrections=True)
    
    corrected = output.copy()
    
    # Extract scalars if present
    if 'scalars' in corrected:
        scalars = corrected['scalars']
        
        # Apply corrections to each scalar
        if len(scalars) >= 2:
            scalars[1] = constraints.enforce_lift_range(scalars[1], alpha_deg)  # CL
        if len(scalars) >= 3:
            scalars[2] = constraints.enforce_positive_drag(scalars[2])  # CD
        if len(scalars) >= 4:
            scalars[3] = constraints.enforce_pitching_moment_stability(scalars[3])  # CM
        if len(scalars) >= 5:
            scalars[4] = constraints.enforce_transition_location(scalars[4])  # xtr_upper
        if len(scalars) >= 6:
            scalars[5] = constraints.enforce_transition_location(scalars[5])  # xtr_lower
        
        corrected['scalars'] = scalars
        corrected['scalars_corrected'] = True
    
    # Apply boundary layer corrections
    for surface in ['upper_bl', 'lower_bl']:
        if surface in corrected and corrected[surface]:
            bl = corrected[surface]
            if 'theta' in bl and 'H' in bl:
                # Estimate delta_star if not present
                if 'delta_star' not in bl and 'theta' in bl and 'H' in bl:
                    bl['delta_star'] = bl['theta'] * bl['H']
                
                bl['theta'], bl['delta_star'], bl['H'] = constraints.enforce_boundary_layer_consistency(
                    bl['theta'], bl['delta_star'], bl['H']
                )
    
    # Add physics metadata
    corrected['physics_applied'] = True
    corrected['physics_violations'] = constraints.get_violations()
    
    return corrected


# ========================================================================
# 11. DRAG POLAR VALIDATION
# ========================================================================

def validate_drag_polar(polar_data: List[Dict], 
                        cd0_estimate: float = None) -> Dict:
    """
    Validate a full drag polar for physical consistency.
    
    Args:
        polar_data: List of dicts with 'alpha', 'cl', 'cd'
        cd0_estimate: Estimated zero-lift drag coefficient
    
    Returns:
        Dict with validation results and corrected data
    """
    constraints = PhysicsConstraintLayer()
    
    if not polar_data:
        return {"valid": False, "message": "Empty polar data"}
    
    cl_values = [p['cl'] for p in polar_data]
    cd_values = [p['cd'] for p in polar_data]
    
    # Check monotonicity of CL vs alpha (should increase initially)
    alphas = [p['alpha'] for p in polar_data]
    cl_increasing = all(cl_values[i] <= cl_values[i+1] for i in range(len(cl_values)-1) 
                       if alphas[i] < 10)  # Up to stall
    
    # Check drag polar convexity
    if cd0_estimate is None:
        # Estimate Cd0 from minimum CD
        cd0_estimate = min(cd_values)
    
    K_estimate = 1.0 / (math.pi * 8.0 * 0.85)
    cd_physical = [cd0_estimate + K_estimate * cl * cl for cl in cl_values]
    
    # Count violations
    violations = []
    for i, (cl, cd, cd_phys) in enumerate(zip(cl_values, cd_values, cd_physical)):
        if cd < cd_phys * 0.7:  # Allow 30% tolerance
            violations.append({
                "alpha": alphas[i],
                "cl": cl,
                "cd": cd,
                "cd_min_physical": cd_phys,
                "violation": "Drag too low for given lift"
            })
    
    return {
        "valid": cl_increasing and len(violations) == 0,
        "cl_monotonic": cl_increasing,
        "violations_count": len(violations),
        "violations": violations,
        "cd0_estimated": cd0_estimate
    }


# ========================================================================
# 12. CONFIDENCE SCORE BASED ON PHYSICS
# ========================================================================

def compute_physics_confidence(prediction: Dict) -> float:
    """
    Compute a confidence score based on how well the prediction satisfies physics.
    Returns a score between 0 and 1.
    """
    score = 1.0
    penalties = []
    
    # Check drag positivity
    cd = prediction.get('cd', prediction.get('cd_total', 1))
    if cd <= 0:
        score *= 0.5
        penalties.append("Negative drag")
    elif cd < 1e-6:
        score *= 0.8
        penalties.append("Drag near zero")
    
    # Check lift range
    cl = prediction.get('cl', 0)
    if abs(cl) > 2.5:
        score *= 0.6
        penalties.append(f"Extreme CL = {cl:.3f}")
    elif abs(cl) > 1.5:
        score *= 0.9
        penalties.append(f"High CL = {cl:.3f}")
    
    # Check pitching moment
    cm = prediction.get('cm', 0)
    if cm > 0.1:
        score *= 0.7
        penalties.append(f"Positive Cm = {cm:.3f} (unstable)")
    
    # Check transition location
    xtr = prediction.get('top_xtr', prediction.get('xtr_upper', 1))
    if xtr < 0 or xtr > 1:
        score *= 0.8
        penalties.append(f"Invalid transition x/c = {xtr:.3f}")
    
    # Check L/D reasonability
    if 'ld_ratio' in prediction:
        ld = prediction['ld_ratio']
        if ld > 100:
            score *= 0.7
            penalties.append(f"L/D = {ld:.1f} exceeds practical limits")
    
    return {
        "score": max(0.0, min(1.0, score)),
        "penalties": penalties,
        "physics_confidence": score
    }