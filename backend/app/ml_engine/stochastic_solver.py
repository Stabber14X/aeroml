# backend/app/ml_engine/stochastic_solver.py
import numpy as np
from scipy.stats import qmc, gaussian_kde

class StochasticManufacturingAudit:
    """
    Executes Latin Hypercube Sampling (LHS) to determine aerodynamic fragility.
    Outputs continuous Probability Density Functions (KDE).
    """
    def __init__(self, base_cst, predict_func):
        self.base_cst = np.array(base_cst)
        self.predict = predict_func 
        
    def run_lhs_monte_carlo(self, reynolds, alpha, mach, noise_percent=1.0, iterations=100):
        baseline = self.predict(self.base_cst.tolist(), reynolds, alpha, mach)
        base_ld = baseline['cl'] / max(baseline['cd'], 1e-6)
        
        num_vars = len(self.base_cst)
        sampler = qmc.LatinHypercube(d=num_vars)
        sample_space = sampler.random(n=iterations)
        
        noise_std = (noise_percent / 100.0) * np.abs(self.base_cst)
        noise_std = np.maximum(noise_std, 0.002) 
        
        from scipy.stats import norm
        gaussian_samples = norm.ppf(sample_space) 
        
        results_ld = []
        for i in range(iterations):
            noisy_cst = self.base_cst + (gaussian_samples[i] * noise_std)
            pred = self.predict(noisy_cst.tolist(), reynolds, alpha, mach)
            ld = pred['cl'] / max(pred['cd'], 1e-6)
            results_ld.append(ld)
            
        results_ld = np.array(results_ld)
        mean_ld = np.mean(results_ld)
        std_ld = np.std(results_ld)
        worst_case_ld = np.percentile(results_ld, 1) 
        
        kde = gaussian_kde(results_ld)
        x_grid = np.linspace(np.min(results_ld)*0.9, np.max(results_ld)*1.1, 100)
        pdf = kde.evaluate(x_grid)
        
        robustness_score = worst_case_ld / base_ld if base_ld > 0 else 0
        
        return {
            "baseline_ld": float(base_ld),
            "mean_ld": float(mean_ld),
            "std_ld": float(std_ld),
            "worst_case_ld": float(worst_case_ld),
            "robustness_score": float(robustness_score),
            "is_fragile": bool(robustness_score < 0.85),
            "pdf_distribution": [{"ld": float(x), "prob": float(y)} for x, y in zip(x_grid, pdf)]
        }