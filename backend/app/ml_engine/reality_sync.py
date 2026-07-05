# backend/app/ml_engine/reality_sync.py
import io
import pandas as pd
import numpy as np
from scipy.signal import savgol_filter
import traceback

class EmpiricalRealitySync:
    """
    Advanced Digital Twin Ingestion Engine.
    Handles ArduPilot Telemetry and extracts time-series traces for visual scatter plotting
    against theoretical AI predictions.
    """
    
    @staticmethod
    def process_flight_log(csv_string, simulated_cd, simulated_cl, wing_area, mtow_kg):
        try:
            # 1. Bruteforce Delimiter Detection
            delimiter = ','
            first_line = csv_string.split('\n')[0]
            if ';' in first_line and ',' not in first_line:
                delimiter = ';'
            elif '\t' in first_line:
                delimiter = '\t'
                
            df = pd.read_csv(io.StringIO(csv_string), sep=delimiter, on_bad_lines='skip')
            
            # Normalize column names to lowercase and strip whitespace
            df.columns = [str(c).strip().lower() for c in df.columns]

            # Strategy A: DroneLogbook Summary Log (Airdata / DroneLogbook)
            col_duration = next((c for c in df.columns if 'duration' in c), None)
            col_distance = next((c for c in df.columns if 'distance' in c), None)
            col_alt = next((c for c in df.columns if 'altitude' in c or 'alt' in c), None)

            if col_duration and col_distance:
                df[col_duration] = pd.to_numeric(df[col_duration], errors='coerce')
                df[col_distance] = pd.to_numeric(df[col_distance], errors='coerce')
                df_valid = df.dropna(subset=[col_duration, col_distance])
                
                if len(df_valid) == 0:
                    raise ValueError("Summary log contained no valid numeric duration/distance data.")
                    
                total_time = df_valid[col_duration].sum()
                total_dist = df_valid[col_distance].sum()
                avg_v = total_dist / max(total_time, 1.0)
                
                avg_alt = 100.0
                if col_alt:
                    df_valid[col_alt] = pd.to_numeric(df_valid[col_alt], errors='coerce')
                    avg_alt = df_valid[col_alt].mean() / 2.0
                    
                avg_power = (mtow_kg * 9.81 * avg_v) / (simulated_cl / max(simulated_cd, 0.01))
                samples = len(df_valid)
                
                # Single point trace for summary log
                trace_records = [{'v': float(avg_v), 'p': float(avg_power)}]

            # Strategy B: High-Frequency Telemetry Log (ArduPilot / PX4)
            else:
                v_col = next((c for c in df.columns if any(k in c for k in ['v_tas', 'aspd', 'airspeed', 'velocity'])), None)
                pwr_col = next((c for c in df.columns if any(k in c for k in ['power', 'batpower', 'currtot', 'current'])), None)
                
                if not v_col:
                    raise ValueError(f"Could not find Airspeed/Velocity column. Found: {list(df.columns)}")
                    
                df[v_col] = pd.to_numeric(df[v_col], errors='coerce')
                if pwr_col: 
                    df[pwr_col] = pd.to_numeric(df[pwr_col], errors='coerce')
                if col_alt: 
                    df[col_alt] = pd.to_numeric(df[col_alt], errors='coerce')
                    
                # Filter for steady state flight
                cruise_mask = df[v_col] > 5.0
                df_cruise = df[cruise_mask].copy()
                
                if len(df_cruise) < 5:
                    raise ValueError("Insufficient steady-state cruise data (Speed > 5 m/s).")
                    
                window = min(51, len(df_cruise) // 2 * 2 + 1)
                if window > 3 and pwr_col:
                    df_cruise['v_smooth'] = savgol_filter(df_cruise[v_col], window, 3)
                    df_cruise['pwr_smooth'] = savgol_filter(df_cruise[pwr_col], window, 3)
                else:
                    df_cruise['v_smooth'] = df_cruise[v_col]
                    df_cruise['pwr_smooth'] = df_cruise[pwr_col] if pwr_col else (mtow_kg * 9.81 * df_cruise['v_smooth']) / (simulated_cl / max(simulated_cd, 0.01))
                
                avg_v = df_cruise['v_smooth'].mean()
                avg_alt = df_cruise[col_alt].mean() if col_alt else 100.0
                avg_power = df_cruise['pwr_smooth'].mean()
                samples = len(df_cruise)
                
                # Extract trace points for the UI scatter plot (Max 150 points to keep UI fast)
                step = max(1, len(df_cruise) // 150)
                trace_df = df_cruise.iloc[::step][['v_smooth', 'pwr_smooth']].copy()
                trace_df = trace_df.rename(columns={'v_smooth': 'v', 'pwr_smooth': 'p'})
                trace_records = trace_df.round(2).to_dict(orient='records')

            # Calibration Math
            rho = 1.225 * (1 - 2.25577e-5 * avg_alt)**4.2561
            prop_efficiency = 0.75 
            thrust_actual = (avg_power * prop_efficiency) / max(avg_v, 1.0)
            
            weight_N = mtow_kg * 9.81
            q_dyn = 0.5 * rho * (avg_v**2) * wing_area
            
            empirical_cd = thrust_actual / max(q_dyn, 1e-6)
            empirical_cl = weight_N / max(q_dyn, 1e-6)
            
            kappa_drag = empirical_cd / max(simulated_cd, 1e-6)
            kappa_lift = empirical_cl / max(simulated_cl, 1e-6)
            
            kappa_drag = max(0.5, min(kappa_drag, 3.0))
            kappa_lift = max(0.5, min(kappa_lift, 2.0))
            
            return {
                "status": "success",
                "telemetry_samples": samples,
                "empirical_data": {
                    "avg_velocity_mps": float(avg_v),
                    "avg_power_W": float(avg_power),
                    "empirical_cd": float(empirical_cd),
                    "empirical_cl": float(empirical_cl),
                    "altitude_m": float(avg_alt)
                },
                "calibration_factors": {
                    "kappa_drag": float(kappa_drag), 
                    "kappa_lift": float(kappa_lift)  
                },
                "telemetry_trace": trace_records
            }
            
        except Exception as e:
            return {"status": "error", "message": f"{str(e)}"}