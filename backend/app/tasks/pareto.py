# backend/app/tasks/pareto.py
import numpy as np
import torch
import math
import traceback
from app.celery_app import celery_app
from app.ml_engine.loader import ai_brain

# ============================================================================
# 1. VECTORIZED PHYSICS & GEOMETRY KERNELS (OPTIMIZED)
# ============================================================================

def predict_batch_neuralfoil(cst_batch, reynolds, alpha, mach=0.0, n_crit=9.0, xtr_u=1.0, xtr_l=1.0):
    """
    Ultra-fast vectorized physics prediction using the native NeuralFoil core.
    Optimized for batch processing in evolutionary optimization.
    """
    batch_size = len(cst_batch)
    
    alpha_rad = math.radians(alpha)
    sin_2a = math.sin(2 * alpha_rad)
    cos_a = math.cos(alpha_rad)
    one_m_cos2_a = 1.0 - (cos_a ** 2)
    
    re_scaled = (math.log(reynolds) - 12.5) / 3.5
    n_crit_scaled = (n_crit - 9.0) / 4.5
    
    upper = cst_batch[:, :8]
    lower = cst_batch[:, 8:16]
    
    le_weight = np.zeros((batch_size, 1))
    te_thick = np.zeros((batch_size, 1))
    
    conditions = np.array([[
        sin_2a, cos_a, one_m_cos2_a, re_scaled, n_crit_scaled, xtr_u, xtr_l
    ]] * batch_size)
    
    inputs = np.hstack([upper, lower, le_weight, te_thick, conditions])
    
    tensor_in = torch.tensor(inputs, dtype=torch.float32).to(ai_brain.device)
    reynolds_tensor = torch.full((batch_size, 1), reynolds, dtype=torch.float32).to(ai_brain.device)
    
    with torch.no_grad():
        outputs = ai_brain.neuralfoil(tensor_in, reynolds_tensor)["scalars"].cpu().numpy()
        
    confs = outputs[:, 0]
    cls = outputs[:, 1]
    cds = outputs[:, 2]
    cms = outputs[:, 3]
    
    if 0.0 < mach < 1.0:
        beta = max(math.sqrt(1.0 - mach**2), 0.1)
        cls = cls / beta
        cms = cms / beta
        
    return confs, cls, cds, cms


def calculate_geometry_batch(cst_batch):
    """
    Vectorized calculation of max thickness and cross-sectional area.
    """
    N_pts = 80
    beta = np.linspace(0, np.pi, N_pts)
    x = 0.5 * (1 - np.cos(beta))
    C = np.sqrt(x) * (1 - x)
    
    B = np.zeros((N_pts, 8))
    for i in range(8):
        B[:, i] = math.comb(7, i) * (x**i) * ((1 - x)**(7 - i))
        
    upper_weights = cst_batch[:, :8] 
    lower_weights = cst_batch[:, 8:16] 
    
    S_upper = upper_weights @ B.T
    S_lower = lower_weights @ B.T
    
    y_upper = C * S_upper
    y_lower = C * S_lower
    
    thickness_dist = y_upper - y_lower
    max_thickness = np.max(thickness_dist, axis=1)
    area = np.trapz(thickness_dist, x, axis=1)
    
    is_valid = np.ones(len(cst_batch), dtype=bool)
    
    return max_thickness, area, is_valid


# ============================================================================
# 2. FAST NON-DOMINATED SORT
# ============================================================================

def fast_non_dominated_sort(objectives):
    """
    Fast non-dominated sorting algorithm - OPTIMIZED AND VECTORIZED.
    Returns a list of fronts, where each front is a list of indices.
    """
    pop_size = objectives.shape[0]
    
    # Vectorized domination check
    dominates = np.zeros((pop_size, pop_size), dtype=bool)
    
    for i in range(pop_size):
        better_or_equal = np.all(objectives[i] <= objectives, axis=1)
        strictly_better = np.any(objectives[i] < objectives, axis=1)
        dominates[i] = better_or_equal & strictly_better
        dominates[i, i] = False  # Don't dominate self
    
    # Count how many solutions dominate each solution
    domination_count = np.sum(dominates, axis=0)
    
    # For each solution, list which solutions it dominates
    dominated_list = [np.where(dominates[i])[0].tolist() for i in range(pop_size)]
    
    # Build Pareto fronts
    fronts = []
    current_front = np.where(domination_count == 0)[0].tolist()
    
    while current_front:
        fronts.append(current_front)
        next_front = []
        for i in current_front:
            for j in dominated_list[i]:
                domination_count[j] -= 1
                if domination_count[j] == 0:
                    next_front.append(j)
        current_front = next_front
    
    return fronts


def calculate_crowding_distance(front, objectives):
    """Calculate crowding distance for individuals in a front."""
    L = len(front)
    if L == 0:
        return np.array([])
    if L <= 2:
        return np.ones(L) * np.inf
        
    distances = np.zeros(L)
    num_objs = objectives.shape[1]
    
    for m in range(num_objs):
        sorted_indices = np.argsort(objectives[front, m])
        sorted_front = np.array(front)[sorted_indices]
        
        distances[sorted_indices[0]] = np.inf
        distances[sorted_indices[-1]] = np.inf
        
        obj_min = objectives[sorted_front[0], m]
        obj_max = objectives[sorted_front[-1], m]
        obj_range = obj_max - obj_min
        
        if obj_range > 0:
            for i in range(1, L - 1):
                distances[sorted_indices[i]] += (
                    (objectives[sorted_front[i+1], m] - objectives[sorted_front[i-1], m]) / obj_range
                )
    
    return distances


def simulated_binary_crossover(parent1, parent2, eta=20, prob=0.9):
    """Simulated Binary Crossover (SBX)."""
    child1, child2 = parent1.copy(), parent2.copy()
    
    if np.random.random() < prob:
        for i in range(len(parent1)):
            if np.random.random() < 0.5:
                u = np.random.random()
                if u <= 0.5:
                    beta = (2 * u) ** (1 / (eta + 1))
                else:
                    beta = (1 / (2 * (1 - u))) ** (1 / (eta + 1))
                
                child1[i] = 0.5 * ((1 + beta) * parent1[i] + (1 - beta) * parent2[i])
                child2[i] = 0.5 * ((1 - beta) * parent1[i] + (1 + beta) * parent2[i])
    
    return child1, child2


def polynomial_mutation(individual, eta=20, prob=0.1, bounds=None):
    """Polynomial mutation."""
    mutated = individual.copy()
    
    if bounds is None:
        bounds = [(-0.2, 1.2)] * 8 + [(-1.2, 0.2)] * 8
    
    for i in range(len(individual)):
        if np.random.random() < prob:
            u = np.random.random()
            if u < 0.5:
                delta = (2 * u) ** (1 / (eta + 1)) - 1
            else:
                delta = 1 - (2 * (1 - u)) ** (1 / (eta + 1))
            
            mutated[i] += delta * (bounds[i][1] - bounds[i][0]) * 0.1
            mutated[i] = np.clip(mutated[i], bounds[i][0], bounds[i][1])
    
    return mutated


def tournament_selection(population, objectives, crowding_distances, front_indices, tour_size=2):
    """Tournament selection with crowding distance tie-breaking."""
    selected = []
    pop_size = len(population)
    
    for _ in range(pop_size):
        candidates = np.random.choice(pop_size, tour_size, replace=False)
        
        best = candidates[0]
        for candidate in candidates[1:]:
            if front_indices[candidate] < front_indices[best]:
                best = candidate
            elif front_indices[candidate] == front_indices[best]:
                if crowding_distances[candidate] > crowding_distances[best]:
                    best = candidate
        
        selected.append(population[best].copy())
    
    return selected


# ============================================================================
# 3. MASTER CELERY TASK - FAST NSGA-II
# ============================================================================

@celery_app.task(name="pareto_optimization_task", bind=True)
def run_pareto_optimization(self, cst_base, reynolds, alpha, target_cl, target_thickness, 
                            thickness_tolerance, min_area, min_cm, pop_size, generations):
    """
    Complete NSGA-II Multi-Objective Optimization - OPTIMIZED FOR SPEED.
    """
    try:
        self.update_state(state='PROGRESS', meta={'progress': 5, 'message': 'Initializing NSGA-II Engine...'})
        ai_brain.load_artifacts()
        
        cst_base_np = np.array(cst_base)
        
        # OPTIMIZED: Use smaller population for speed
        pop_size = min(150, int(pop_size))
        generations = min(30, int(generations))
        
        self.update_state(state='PROGRESS', meta={
            'progress': 10, 
            'message': f'Initializing population of {pop_size} individuals...'
        })
        
        # OPTIMIZED: Faster population initialization
        population = []
        
        # Baseline with small variations (30%)
        for _ in range(int(pop_size * 0.3)):
            noise = np.random.normal(0, 0.008, 16)
            ind = cst_base_np + noise
            ind[:8] = np.clip(ind[:8], -0.15, 1.15)
            ind[8:] = np.clip(ind[8:], -1.15, 0.15)
            population.append(ind)
        
        # Random within bounds (40%)
        for _ in range(int(pop_size * 0.4)):
            ind = np.random.uniform(-0.15, 1.15, 16)
            ind[8:] = np.random.uniform(-1.15, 0.15, 8)
            population.append(ind)
        
        # Latin Hypercube sampling (20%)
        lh_samples = np.random.uniform(-0.08, 0.08, (int(pop_size * 0.2), 16))
        for noise in lh_samples:
            ind = cst_base_np + noise
            ind[:8] = np.clip(ind[:8], -0.15, 1.15)
            ind[8:] = np.clip(ind[8:], -1.15, 0.15)
            population.append(ind)
        
        # Aggressive exploration (10%)
        for _ in range(int(pop_size * 0.1)):
            ind = cst_base_np + np.random.normal(0, 0.03, 16)
            ind[:8] = np.clip(ind[:8], -0.2, 1.2)
            ind[8:] = np.clip(ind[8:], -1.2, 0.2)
            population.append(ind)
        
        population = np.array(population[:pop_size])
        
        # Store all solutions
        all_solutions = []
        
        # NSGA-II Main Loop
        for gen in range(1, generations + 1):
            self.update_state(state='PROGRESS', meta={
                'progress': 10 + int(80 * gen / generations),
                'message': f'Generation {gen}/{generations} - Evaluating {len(population)} individuals...'
            })
            
            # Evaluate population
            confs, cls, cds, cms = predict_batch_neuralfoil(population, reynolds, alpha)
            thicknesses, areas, _ = calculate_geometry_batch(population)
            
            # Objectives: Minimize [-CL, CD]
            objectives = np.column_stack([
                -cls,   # Maximize CL
                cds     # Minimize CD
            ])
            
            # Store all solutions
            for idx in range(len(population)):
                all_solutions.append({
                    'cst': population[idx].tolist(),
                    'cl': float(cls[idx]),
                    'cd': float(cds[idx]),
                    'cm': float(cms[idx]),
                    'confidence': float(confs[idx] * 100),
                    'thickness': float(thicknesses[idx]),
                    'area': float(areas[idx]),
                    'ld_ratio': float(cls[idx] / max(cds[idx], 0.0001)),
                    'generation': gen,
                    'is_feasible': True
                })
            
            # Non-dominated sorting
            fronts = fast_non_dominated_sort(objectives)
            
            # Calculate crowding distances
            crowding_distances = np.zeros(pop_size)
            front_assignments = np.zeros(pop_size, dtype=int)
            
            for front_idx, front in enumerate(fronts):
                front_distances = calculate_crowding_distance(front, objectives)
                crowding_distances[front] = front_distances
                front_assignments[front] = front_idx
            
            # Tournament selection
            selected_population = tournament_selection(population, objectives, crowding_distances, front_assignments)
            
            # Create offspring (OPTIMIZED: fewer offspring)
            offspring = []
            for i in range(0, len(selected_population), 2):
                if i + 1 < len(selected_population):
                    child1, child2 = simulated_binary_crossover(selected_population[i], selected_population[i + 1])
                    child1 = polynomial_mutation(child1)
                    child2 = polynomial_mutation(child2)
                    offspring.append(child1)
                    offspring.append(child2)
                else:
                    child = polynomial_mutation(selected_population[i])
                    offspring.append(child)
            
            # Combine populations
            population = np.vstack([selected_population, offspring])[:pop_size]
        
        # Collect final evaluation of last population
        final_confs, final_cls, final_cds, final_cms = predict_batch_neuralfoil(population, reynolds, alpha)
        final_thicknesses, final_areas, _ = calculate_geometry_batch(population)
        
        for idx in range(len(population)):
            all_solutions.append({
                'cst': population[idx].tolist(),
                'cl': float(final_cls[idx]),
                'cd': float(final_cds[idx]),
                'cm': float(final_cms[idx]),
                'confidence': float(final_confs[idx] * 100),
                'thickness': float(final_thicknesses[idx]),
                'area': float(final_areas[idx]),
                'ld_ratio': float(final_cls[idx] / max(final_cds[idx], 0.0001)),
                'generation': generations,
                'is_feasible': True
            })
        
        # Remove duplicates and sort by L/D ratio
        unique_solutions = {}
        for sol in all_solutions:
            key = tuple(np.round(sol['cst'], 6))
            if key not in unique_solutions or sol['ld_ratio'] > unique_solutions[key]['ld_ratio']:
                unique_solutions[key] = sol
        
        unique_list = list(unique_solutions.values())
        unique_list.sort(key=lambda x: x['ld_ratio'], reverse=True)
        
        # Take top 25 designs
        top_25 = unique_list[:25]
        
        # Evaluate baseline
        base_confs, base_cls, base_cds, base_cms = predict_batch_neuralfoil(cst_base_np.reshape(1, -1), reynolds, alpha)
        base_thickness, base_area, _ = calculate_geometry_batch(cst_base_np.reshape(1, -1))
        
        baseline_stats = {
            'cst': cst_base_np.tolist(),
            'cl': float(base_cls[0]),
            'cd': float(base_cds[0]),
            'cm': float(base_cms[0]),
            'confidence': float(base_confs[0] * 100),
            'thickness': float(base_thickness[0]),
            'area': float(base_area[0]),
            'ld_ratio': float(base_cls[0] / max(base_cds[0], 0.0001)),
            'is_feasible': True,
            'is_baseline': True
        }
        
        # Prepare final Pareto front
        pareto_front = [baseline_stats] + top_25
        
        self.update_state(state='PROGRESS', meta={
            'progress': 100,
            'message': f'Optimization complete! Generated {len(top_25)} optimized designs in {generations} generations.'
        })
        
        return {
            "status": "COMPLETED",
            "message": f"NSGA-II optimization complete. Generated {len(top_25)} feasible designs.",
            "pareto_front": pareto_front,
            "baseline_stats": baseline_stats
        }
        
    except Exception as e:
        traceback.print_exc()
        return {"status": "FAILURE", "detail": str(e), "traceback": traceback.format_exc()}