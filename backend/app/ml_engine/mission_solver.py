# backend/app/ml_engine/mission_solver.py
import math
import numpy as np

class MissionDynamicsSolver:
    """
    Comprehensive Flight Mechanics Solver.
    Calculates Specific Excess Power (Ps), V-n diagrams, and Breguet phases.
    """
    
    def __init__(self, cl_2d, cd_2d, aspect_ratio=8.0, oswald_e=0.85):
        self.cl_2d = cl_2d
        self.cd_2d = max(cd_2d, 0.0001)
        self.AR = aspect_ratio
        self.e = oswald_e
        
        self.cl_3d = self.cl_2d / (1 + (self.cl_2d / (math.pi * self.AR * self.e)))
        self.cd_induced = (self.cl_3d**2) / (math.pi * self.AR * self.e)
        self.cd_3d = self.cd_2d + self.cd_induced
        self.ld_ratio = self.cl_3d / max(self.cd_3d, 0.0001)

    def evaluate_envelope(self, mtow_kg, empty_weight_kg, fuel_weight_kg, wing_area_m2, thrust_N, sfc_kg_Ns, rho):
        g = 9.81
        W_total_N = mtow_kg * g
        W_empty_N = (mtow_kg - fuel_weight_kg) * g
        
        cl_max_assumed = max(self.cl_3d * 1.5, 1.3)
        v_stall = math.sqrt((2 * W_total_N) / (rho * wing_area_m2 * cl_max_assumed))
        
        cd0 = self.cd_2d
        K = 1.0 / (math.pi * self.AR * self.e)
        v_md = math.sqrt((2 * W_total_N) / (rho * wing_area_m2)) * (K / cd0)**0.25
        
        D_min = 2 * W_total_N * math.sqrt(K * cd0)
        
        v_max = v_md
        for _ in range(50):
            q = 0.5 * rho * v_max**2
            D_total = q * wing_area_m2 * cd0 + (K * W_total_N**2) / (q * wing_area_m2)
            if abs(D_total - thrust_N) < 100 or v_max > 1000:
                break
            v_max += 2.0
            
        range_km = 0.0
        endurance_hrs = 0.0
        if sfc_kg_Ns > 0 and fuel_weight_kg > 0 and self.ld_ratio > 0:
            ln_weight_ratio = math.log(W_total_N / W_empty_N)
            range_m = (v_md / sfc_kg_Ns) * (0.866 * self.ld_ratio) * ln_weight_ratio
            range_km = range_m / 1000.0
            
            fuel_flow_rate = D_min * sfc_kg_Ns
            endurance_hrs = (fuel_weight_kg / fuel_flow_rate) / 3600.0 if fuel_flow_rate > 0 else 0

        excess_thrust = thrust_N - D_min
        roc_mps = v_md * (excess_thrust / W_total_N) if excess_thrust > 0 else 0
        
        n_max_struct = 9.0 
        v_corner = v_stall * math.sqrt(n_max_struct)
        
        n_sustained = 1.0
        turn_radius_m = 9999.0
        if thrust_N > D_min:
            q_md = 0.5 * rho * v_md**2
            max_cl_sust = (thrust_N / (q_md * wing_area_m2)) - cd0
            max_cl_sust = min(max_cl_sust / K, cl_max_assumed)
            n_sustained = max(1.0, (q_md * wing_area_m2 * max_cl_sust) / W_total_N)
            if n_sustained > 1.01:
                turn_radius_m = (v_md**2) / (g * math.sqrt(n_sustained**2 - 1.0))

        return {
            "aerodynamics": {
                "cl_3d": self.cl_3d,
                "cd_3d_total": self.cd_3d,
                "cd_induced": self.cd_induced,
                "ld_ratio_3d": self.ld_ratio,
                "cd0": cd0
            },
            "performance": {
                "v_stall_mps": v_stall,
                "v_cruise_optimal_mps": v_md,
                "v_max_mps": v_max,
                "v_corner_mps": v_corner,
                "drag_min_N": D_min,
                "breguet_range_km": range_km,
                "max_endurance_hrs": endurance_hrs,
                "max_rate_of_climb_mps": roc_mps,
                "max_sustained_load_factor_g": n_sustained,
                "min_turn_radius_m": turn_radius_m
            }
        }