# backend/app/ml_engine/vlm_solver.py
import aerosandbox as asb
import aerosandbox.numpy as np
import math
import torch
from app.utils.cst_generation import calculate_coords
from app.ml_engine.loader import ai_brain
import traceback

def run_vlm_simulation(data):
    """
    Executes an Advanced Vortex Lattice Method simulation using AeroSandbox.
    Upgraded with Quasi-3D Viscous Coupling via NeuralFoil.
    """
    try:
        # 1. Generate Airfoil Coordinates from CST
        x_coords, y_coords = calculate_coords(data.cst_upper, data.cst_lower, num_points=80)
        coordinates = np.column_stack((x_coords, y_coords))
        
        # 2. Define Airfoil Object
        poly_airfoil = asb.Airfoil(
            name="Custom_CST",
            coordinates=coordinates
        )

        # 3. Dynamic Reference Calculations (MAC and Area)
        chord_tip = data.chord_root_m * data.taper_ratio
        tr = data.taper_ratio
        mac = (2 / 3) * data.chord_root_m * (1 + tr + tr**2) / (1 + tr)
        s_ref = (data.chord_root_m + chord_tip) * data.span_m / 2

        # 4. Define Swept Wing Geometry
        wing = asb.Wing(
            name="Main Wing",
            symmetric=True, 
            xsecs=[
                asb.WingXSec(
                    xyz_le=[0, 0, 0],
                    chord=data.chord_root_m,
                    twist=0,
                    airfoil=poly_airfoil
                ),
                asb.WingXSec(
                    xyz_le=[
                        (data.span_m / 2) * np.tan(np.radians(data.sweep_deg)), 
                        data.span_m / 2, 
                        0
                    ],
                    chord=chord_tip,
                    twist=data.twist_deg,
                    airfoil=poly_airfoil
                )
            ]
        )

        # 5. Define Airplane with explicit Reference Geometries
        airplane = asb.Airplane(
            name="AeroML_Concept",
            xyz_ref=[mac * 0.25, 0, 0], 
            s_ref=s_ref,
            c_ref=mac,
            b_ref=data.span_m,
            wings=[wing]
        )

        # 6. ISA Atmosphere & Compressibility (Mach) Calculation
        alt = data.altitude_m
        temp_k = 288.15 - 0.0065 * alt if alt < 11000 else 216.65
        speed_of_sound = math.sqrt(1.4 * 287.05 * temp_k)
        mach_number = data.velocity_mps / speed_of_sound

        op_point = asb.OperatingPoint(
            velocity=data.velocity_mps,
            alpha=data.alpha_deg,
            mach=mach_number 
        )

        # 7. Adaptive Resolution
        span_res = int(12 + (abs(data.sweep_deg) / 5))
        chord_res = int(8 + (abs(data.sweep_deg) / 10))

        # 8. Run VLM Solver
        vlm = asb.VortexLatticeMethod(
            airplane=airplane,
            op_point=op_point,
            spanwise_resolution=span_res,
            chordwise_resolution=chord_res,
        )
        
        aero = vlm.run()

        # 9. Extract Spanwise Lift Distribution & QUASI-3D COUPLING
        y_sorted = []
        lift_norm = []
        lift_sorted = []
        viscous_cd_local = []

        try:
            if hasattr(vlm, 'panel_collocation_points'):
                y_centers = vlm.panel_collocation_points[:, 1]
            elif hasattr(vlm, 'grid_centers'):
                y_centers = vlm.grid_centers[:, 1]
            else:
                raise AttributeError("Cannot locate VLM panel centers.")

            if hasattr(vlm, 'panel_forces_structural'):
                F_z = vlm.panel_forces_structural[:, 2]
            elif hasattr(vlm, 'panel_forces'):
                F_z = vlm.panel_forces[:, 2]
            else:
                F_z = np.zeros_like(y_centers)

            span_stations = {}
            for y, fz in zip(y_centers, F_z):
                if y > 0.01:
                    key = round(float(y), 3)
                    span_stations[key] = span_stations.get(key, 0.0) + float(fz)

            if span_stations:
                y_sorted = sorted(list(span_stations.keys()))
                lift_sorted = [span_stations[y] for y in y_sorted]
                max_lift = max(lift_sorted) if lift_sorted else 1.0
                max_lift = max_lift if max_lift > 1e-9 else 1.0
                lift_norm = [l / max_lift for l in lift_sorted]

                # TRUE COUPLING: Query NeuralFoil for local CD based on local twist
                batch_size = len(y_sorted)
                re_scaled = (math.log(data.velocity_mps * data.chord_root_m / 1.5e-5) - 12.5) / 3.5
                
                batch_inputs = []
                for y_val in y_sorted:
                    local_twist = data.twist_deg * (y_val / (data.span_m / 2.0))
                    local_alpha = data.alpha_deg + local_twist
                    local_a_rad = math.radians(local_alpha)
                    
                    batch_inputs.append(data.cst_upper + data.cst_lower + [
                        0.0, 0.0, math.sin(2*local_a_rad), math.cos(local_a_rad), 1.0 - math.cos(local_a_rad)**2,
                        re_scaled, 0.0, 1.0, 1.0
                    ])
                
                # Verify AI brain is loaded
                if hasattr(ai_brain, 'neuralfoil') and ai_brain.neuralfoil is not None:
                    t_in = torch.tensor(batch_inputs, dtype=torch.float32).to(ai_brain.device)
                    re_t = torch.tensor([[data.velocity_mps * data.chord_root_m / 1.5e-5]] * batch_size, dtype=torch.float32).to(ai_brain.device)
                    
                    with torch.no_grad():
                        nf_out = ai_brain.neuralfoil(t_in, re_t)
                        scalars = nf_out["scalars"].cpu().numpy()
                        viscous_cd_local = scalars[:, 2].tolist()

        except Exception as e:
            print(f"VLM Distribution Extraction Failed: {e}")

        # 10. Calculate Oswald Efficiency and Total Drag
        AR = (data.span_m ** 2) / s_ref
        CL = aero['CL']
        CDi = aero['CD']
        
        e_span = 0.0
        if CDi > 1e-6:
            e_span = (CL ** 2) / (np.pi * AR * CDi)
            e_span = min(max(e_span, 0.0), 1.0) 

        # Quasi-3D Integration: Induced Drag + Average Profile Drag
        CD_profile_integrated = sum(viscous_cd_local) / len(viscous_cd_local) if viscous_cd_local else 0.015
        CD_total_3d = CDi + CD_profile_integrated

        return {
            "CL": float(aero['CL']),
            "CD_induced": float(CDi),
            "CD_total": float(CD_total_3d),
            "CM": float(aero['Cm']),
            "L_over_D": float(aero['CL'] / (CD_total_3d + 1e-6)),
            "span_efficiency": float(e_span),
            "y_stations": y_sorted,
            "cl_local": lift_norm,
            "cl_load": lift_sorted
        }

    except Exception as top_e:
        print(traceback.format_exc())
        raise Exception(f"VLM Initialization Failed: {str(top_e)}")