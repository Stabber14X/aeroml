# backend/app/ml_engine/acoustics_solver.py
import numpy as np
import math

def calculate_bpm_noise(data):
    """
    Implements a simplified Brooks-Pope-Marcolini (BPM) empirical model
    focusing on Turbulent Boundary Layer-Trailing Edge (TBL-TE) noise.
    
    Reference: NASA Reference Publication 1218 (1989)
    """
    # Unpack inputs
    U = data.velocity_mps
    c = data.chord_m
    L = data.span_m
    delta = data.delta_star_m # Boundary layer displacement thickness
    alpha = data.alpha_deg
    dist = data.observer_distance_m
    
    # Safety clips
    U = max(U, 10.0)
    delta = max(delta, 0.0001)
    
    # Frequency range: 100 Hz to 10 kHz
    freqs = np.linspace(100, 10000, 100)
    spl_spectrum = []
    
    # Constants for TBL-TE Noise
    # Strouhal number based on boundary layer thickness
    St_prime = 0.1 
    
    for f in freqs:
        # Strouhal Number for this frequency
        St = (f * delta) / U
        
        # Spectral Shape Function A(St)
        # Empirical curve fit approximating the BPM peak
        # Peak usually around St = 0.1
        log_St = np.log10(St)
        shape_factor = -20 * ((log_St - np.log10(St_prime)) ** 2)
        
        # Amplitude Scaling Law
        # SPL ~ 10log(delta * M^5 * L * D^-2)
        # U^5 scaling is the classic dipole source behavior
        Mach = U / 343.0
        
        # Scaling magnitude (Base dB)
        # 128.5 is an empirical calibration constant for clean airfoils
        amplitude = 128.5 + 10 * np.log10(delta * L / (dist**2)) + 50 * np.log10(Mach)
        
        # Directivity correction (High alpha increases noise)
        # Simple cardioid-like approximation for TE noise
        directivity = 10 * np.log10(1 + np.sin(np.radians(alpha))**2)
        
        total_db = amplitude + shape_factor + directivity
        spl_spectrum.append(max(0, total_db))
        
    # Calculate Overall Sound Pressure Level (OASPL)
    # Logarithmic sum of the spectrum
    energy_sum = sum([10**(db/10) for db in spl_spectrum])
    oaspl = 10 * np.log10(energy_sum) if energy_sum > 0 else 0.0
    
    # Find peak frequency
    peak_idx = np.argmax(spl_spectrum)
    peak_freq = freqs[peak_idx]
    
    return {
        "overall_spl_db": float(oaspl),
        "peak_frequency_hz": float(peak_freq),
        "spectrum_freq": freqs.tolist(),
        "spectrum_db": [float(x) for x in spl_spectrum]
    }