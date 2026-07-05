# backend/app/ml_engine/aero_physics.py
import math
import numpy as np
from scipy.optimize import fsolve

def standard_atmosphere(altitude_m: float):
    """
    Computes International Standard Atmosphere (ISA) properties.
    Valid up to the tropopause (~11,000 m) and lower stratosphere.
    """
    # Sea level constants
    T0 = 288.15        # Temperature in Kelvin
    P0 = 101325.0      # Pressure in Pascals
    rho0 = 1.225       # Density in kg/m^3
    g = 9.80665        # Gravity m/s^2
    R = 287.05         # Specific gas constant J/(kg*K)
    gamma = 1.4        # Ratio of specific heats
    
    # Troposphere lapse rate
    L = 0.0065         # K/m

    if altitude_m < 11000:
        # Troposphere
        T = T0 - L * altitude_m
        P = P0 * math.pow(T / T0, g / (L * R))
    else:
        # Lower Stratosphere (Isothermal)
        T = 216.65
        P_11k = P0 * math.pow(216.65 / T0, g / (L * R))
        P = P_11k * math.exp(-g * (altitude_m - 11000) / (R * T))

    rho = P / (R * T)
    a = math.sqrt(gamma * R * T) # Speed of sound
    
    # Sutherland's Law for Dynamic Viscosity (mu)
    C1 = 1.458e-6
    S = 110.4
    mu = (C1 * math.pow(T, 1.5)) / (T + S)
    
    # Kinematic Viscosity (nu)
    nu = mu / rho
    
    return {
        "temperature_k": T,
        "pressure_pa": P,
        "density_kg_m3": rho,
        "dynamic_viscosity": mu,
        "kinematic_viscosity": nu,
        "speed_of_sound_m_s": a
    }

def calculate_flight_envelope(altitude_m: float, velocity_mps: float, chord_m: float):
    """
    Converts real-world mission parameters into dimensionless aerodynamic numbers.
    """
    atm = standard_atmosphere(altitude_m)
    
    mach = velocity_mps / atm["speed_of_sound_m_s"]
    reynolds = (velocity_mps * chord_m) / atm["kinematic_viscosity"]
    dynamic_pressure = 0.5 * atm["density_kg_m3"] * (velocity_mps ** 2)
    
    return {
        "mach": mach,
        "reynolds": reynolds,
        "dynamic_pressure_pa": dynamic_pressure,
        "atmosphere": atm
    }

def karman_tsien_correction(cp_incompressible: float, mach: float):
    """
    Applies the Karman-Tsien compressibility correction.
    Far superior to Prandtl-Glauert for high subsonic Mach numbers.
    """
    if mach <= 0.01 or mach >= 1.0:
        return cp_incompressible
        
    beta = math.sqrt(1.0 - mach**2)
    numerator = cp_incompressible
    denominator = beta + (cp_incompressible * (mach**2)) / (2.0 * (1.0 + beta))
    
    return numerator / denominator

def calculate_critical_mach(cp_min: float):
    """
    Solves for the Critical Mach Number (M_crit) where local flow reaches Mach 1.0.
    Uses fsolve to equate the Karman-Tsien C_p to the isentropic critical C_p.
    """
    if cp_min >= 0:
        return 1.0 # Unlikely to reach Mach 1 on the surface if pressure is positive
        
    gamma = 1.4
    
    def cp_crit(M):
        # Isentropic pressure coefficient where local Mach = 1
        term1 = (2.0 + (gamma - 1.0) * M**2) / (gamma + 1.0)
        exponent = gamma / (gamma - 1.0)
        return (2.0 / (gamma * M**2)) * (math.pow(term1, exponent) - 1.0)
        
    def residual(M):
        # We want Karman-Tsien corrected minimum Cp to equal the critical Cp
        cp_kt = karman_tsien_correction(cp_min, M)
        return cp_kt - cp_crit(M)
        
    try:
        # Solve for M starting from a guess of M=0.5
        m_crit_solution, = fsolve(residual, x0=0.5)
        # Drag Divergence is typically estimated as M_crit + 0.05
        m_dd = m_crit_solution + 0.05 
        return float(m_crit_solution), float(m_dd)
    except:
        return 0.0, 0.0