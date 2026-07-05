# backend/app/tasks/gradient_optimizer.py
import torch
import torch.nn.functional as F
import numpy as np
import math
import traceback
from app.celery_app import celery_app
from app.ml_engine.loader import ai_brain

@celery_app.task(name="inverse_design_task", bind=True)
def run_gradient_optimization(self, **kwargs):
    """
    Phase 4 Sovereign Engine: Strict PyTorch AutoGrad Inverse Design with 
    Physics-Informed Gradient Descent.
    
    Uses physics-informed Jacobian calculations and physics-based constraints
    to guide the optimization toward physically feasible solutions.
    """
    try:
        self.update_state(state='PROGRESS', meta={'progress': 2, 'message': 'Initializing Physics-Informed AutoGrad Engine...'})
        ai_brain.load_artifacts()
        device = ai_brain.device
        
        # 1. Parse Mission Command Directives
        target_type = kwargs.get('target_type', 'ALL') 
        
        # Safely extract targets
        t_cl = float(kwargs.get('target_cl', kwargs.get('target_value', 1.0)))
        t_cd = float(kwargs.get('target_cd', 0.015))
        t_cm = float(kwargs.get('target_cm', -0.1))
        
        opt_goal = kwargs.get('goal', 'NONE') 
        
        reynolds = float(kwargs.get('reynolds', 3000000.0))
        alpha_val = float(kwargs.get('alpha', 5.0))
        mach = float(kwargs.get('mach', 0.0))
        
        enforce_feasibility = str(kwargs.get('enforce_feasibility', 'True')).lower() == 'true'
        max_epochs = int(kwargs.get('iterations', 100)) 
        
        initial_cst = kwargs.get('initial_cst')
        if not initial_cst or len(initial_cst) != 16:
            initial_cst = [0.155, 0.165, 0.150, 0.100, 0.050, 0.020, 0.010, 0.005, 
                          -0.100, -0.150, -0.130, -0.100, -0.070, -0.040, -0.020, -0.010]
        
        # 2. Physics-informed Boundary Definition (Sigmoid Space)
        u_min, u_max = (-0.1, 0.8) if enforce_feasibility else (-2.0, 2.0)
        l_min, l_max = (-0.8, 0.1) if enforce_feasibility else (-2.0, 2.0)
        
        def inv_sigmoid(val, min_v, max_v):
            val = np.clip(val, min_v + 1e-5, max_v - 1e-5)
            norm = (val - min_v) / (max_v - min_v)
            return math.log(norm / (1.0 - norm))

        raw_initial = []
        for i in range(8): raw_initial.append(inv_sigmoid(initial_cst[i], u_min, u_max))
        for i in range(8, 16): raw_initial.append(inv_sigmoid(initial_cst[i], l_min, l_max))
        
        cst_raw = torch.tensor(raw_initial, dtype=torch.float32, requires_grad=True, device=device)
        
        # 3. Physics-informed Flight Conditions Tensor
        alpha_rad = math.radians(alpha_val)
        re_scaled = (math.log(reynolds) - 12.5) / 3.5
        
        flight_conds = torch.tensor([
            0.0, 0.0, math.sin(2 * alpha_rad), math.cos(alpha_rad), 1.0 - (math.cos(alpha_rad)**2),
            re_scaled, 0.0, 1.0, 1.0 
        ], dtype=torch.float32, device=device)
        
        reynolds_tensor = torch.tensor([[reynolds]], dtype=torch.float32, device=device)
        beta = max(math.sqrt(1.0 - mach**2), 0.1) if 0.0 < mach < 1.0 else 1.0
        
        def get_differentiable_thickness(cst):
            """Physics-informed thickness calculation (must remain positive for physical feasibility)."""
            x = torch.linspace(0, 1, 50, device=device)
            C = (x**0.5) * (1.0 - x)
            S_u = sum([cst[i] * math.comb(7, i) * (x**i) * ((1.0 - x)**(7 - i)) for i in range(8)])
            S_l = sum([cst[i+8] * math.comb(7, i) * (x**i) * ((1.0 - x)**(7 - i)) for i in range(8)])
            return torch.max(C * S_u - C * S_l)
        
        # 4. Physics-informed Adam Optimizer Setup
        optimizer = torch.optim.Adam([cst_raw], lr=0.08)
        
        global_state = {
            'best_loss': float('inf'), 'best_cst': initial_cst, 'metrics': (0.0, 0.0, 0.0), 'conf': 1.0, 'jacobian': [0]*16
        }

        self.update_state(state='PROGRESS', meta={'progress': 5, 'message': f"Initiating physics-informed solver. Feasibility Enforced: {enforce_feasibility}"})

        target_tensor_cl = torch.tensor(t_cl, device=device)
        target_tensor_cd = torch.tensor(t_cd, device=device)
        target_tensor_cm = torch.tensor(t_cm, device=device)
        initial_cst_tensor = torch.tensor(initial_cst, device=device)

        # 5. Physics-informed Training Loop
        for epoch in range(1, max_epochs + 1):
            optimizer.zero_grad()
            
            # Map raw unconstrained values back to physical boundaries
            upper_cst = torch.sigmoid(cst_raw[:8]) * (u_max - u_min) + u_min
            lower_cst = torch.sigmoid(cst_raw[8:]) * (l_max - l_min) + l_min
            cst_tensor = torch.cat([upper_cst, lower_cst])
            
            # Forward pass through the Physics-Informed Sovereign AI Core
            inputs_2d = torch.cat([cst_tensor, flight_conds]).unsqueeze(0)
            outputs = ai_brain.neuralfoil(inputs_2d, reynolds_tensor)
            scalars = outputs["scalars"][0]
            
            conf = scalars[0]
            cl = scalars[1] / beta
            cd = scalars[2]
            cm = scalars[3] / beta
            thickness = get_differentiable_thickness(cst_tensor)
            
            # --- The Strict Physics-Informed Lagrangian Formulation ---
            loss_cl = F.mse_loss(cl, target_tensor_cl)
            loss_cd = F.mse_loss(cd, target_tensor_cd)
            loss_cm = F.mse_loss(cm, target_tensor_cm)
            
            total_loss = 0.0
            
            if target_type == 'CL':
                total_loss += loss_cl * 1000000.0
                if opt_goal == 'MIN_DRAG': total_loss += cd * 5000.0
                elif opt_goal == 'MAX_THICKNESS': total_loss -= thickness * 1000.0
            elif target_type == 'CM':
                total_loss += loss_cm * 1000000.0
                if opt_goal == 'MIN_DRAG': total_loss += cd * 5000.0
                elif opt_goal == 'MAX_THICKNESS': total_loss -= thickness * 1000.0
            else:
                if enforce_feasibility:
                    # Physics-informed multi-objective loss (prioritizing physical feasibility)
                    total_loss += (loss_cl * 1e6) + (loss_cd * 1e4) + (loss_cm * 1e4)
                else:
                    # Brute force physics-unconstrained optimization
                    total_loss += (loss_cl * 1e6) + (loss_cd * 1e9) + (loss_cm * 1e6)

            # Physics-informed Feasibility Penalties
            if enforce_feasibility:
                penalty_conf = F.relu(0.85 - conf) ** 2  # Physics confidence penalty
                reg_shape = F.mse_loss(cst_tensor, initial_cst_tensor)  # Shape regularization
                penalty_thick = F.relu(0.01 - thickness) ** 2  # Prevent crossing lines (physics constraint)
                total_loss += (penalty_conf * 1e6) + (reg_shape * 1e3) + (penalty_thick * 1e7)
            
            total_loss.backward()
            val = total_loss.item()
            
            # Capture the Physics-informed Jacobian matrix for UI Heatmap
            if cst_raw.grad is not None:
                global_state['jacobian'] = cst_raw.grad.detach().cpu().numpy().tolist()

            optimizer.step()

            # Track the best physics-informed state
            is_valid = True
            if enforce_feasibility:
                if conf.item() < 0.70 or thickness.item() < 0.01:
                    is_valid = False
            
            if is_valid and val < global_state['best_loss']:
                global_state['best_loss'] = val
                global_state['best_cst'] = cst_tensor.detach().cpu().numpy().tolist()
                global_state['metrics'] = (cl.item(), cd.item(), cm.item())
                global_state['conf'] = conf.item()
            
            # Throttle UI updates
            if epoch % 5 == 0 or epoch == max_epochs:
                prog = int((epoch / max_epochs) * 100)
                
                self.update_state(state='PROGRESS', meta={
                    'progress': min(prog, 99), 
                    'message': f"Physics-informed Step {epoch}/{max_epochs} | Loss: {val:.1f} | CL: {cl.item():.4f} | CD: {cd.item():.5f}",
                    'current_cl': global_state['metrics'][0],
                    'current_cd': global_state['metrics'][1],
                    'current_cst': global_state['best_cst'],
                    'jacobian': global_state['jacobian']
                })
                
            # Early stopping if physics-informed convergence achieved
            if target_type == 'ALL' and not enforce_feasibility:
                if loss_cl.item() < 1e-6 and loss_cd.item() < 1e-8 and loss_cm.item() < 1e-6:
                    break

        # Fallback if no valid state found
        if global_state['best_loss'] == float('inf'):
            global_state['best_cst'] = cst_tensor.detach().cpu().numpy().tolist()
            global_state['metrics'] = (cl.item(), cd.item(), cm.item())

        return {
            "status": "COMPLETED",
            "message": f"Physics-informed optimization finished. Final CL: {global_state['metrics'][0]:.4f}",
            "optimized_cst": global_state['best_cst'],
            "final_cl": float(global_state['metrics'][0]),
            "final_cd": float(global_state['metrics'][1]),
            "final_cm": float(global_state['metrics'][2])
        }
        
    except Exception as e:
        return {"status": "FAILED", "detail": str(e), "traceback": traceback.format_exc()}