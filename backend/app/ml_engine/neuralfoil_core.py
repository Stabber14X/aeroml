# backend/app/ml_engine/neuralfoil_core.py
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import os

class NeuralFoilPyTorch(nn.Module):
    """
    Native PyTorch implementation of NeuralFoil.
    Vendored and optimized for massive batch processing (Genetic Algorithms) on GPU.
    """
    def __init__(self, model_size="xlarge", models_dir=None):
        super().__init__()
        if models_dir is None:
            models_dir = os.path.join(os.path.dirname(__file__), "..", "..", "trained_models")
            
        # 1. Load Data Statistics
        stats_path = os.path.join(models_dir, "scaled_input_distribution.npz")
        stats = np.load(stats_path)
        
        # Register as buffers so they move to the correct device automatically
        self.register_buffer("mean_inputs", torch.tensor(stats["mean_inputs_scaled"], dtype=torch.float32))
        self.register_buffer("inv_cov_inputs", torch.tensor(stats["inv_cov_inputs_scaled"], dtype=torch.float32))
        self.n_inputs = len(stats["mean_inputs_scaled"])
        
        # 2. Load Network Weights
        weights_path = os.path.join(models_dir, f"nn-{model_size}.npz")
        if not os.path.exists(weights_path):
            raise FileNotFoundError(f"NeuralFoil weights not found at {weights_path}")
            
        nn_params = np.load(weights_path)
        
        # Determine number of layers
        layer_indices = sorted(list(set([int(k.split(".")[1]) for k in nn_params.keys()])))
        
        self.weights = nn.ParameterList()
        self.biases = nn.ParameterList()
        
        for i in layer_indices:
            w = torch.tensor(nn_params[f"net.{i}.weight"], dtype=torch.float32)
            b = torch.tensor(nn_params[f"net.{i}.bias"], dtype=torch.float32)
            self.weights.append(nn.Parameter(w, requires_grad=False))
            self.biases.append(nn.Parameter(b, requires_grad=False))
            
    def _sq_mahalanobis(self, x):
        """Measures how far the input is from the training data distribution."""
        x_minus_mean = x - self.mean_inputs
        # Batched quadratic form: (x-mu)^T * InvCov * (x-mu)
        return torch.sum(torch.matmul(x_minus_mean, self.inv_cov_inputs) * x_minus_mean, dim=1)

    def _raw_net(self, x):
        """Core MLP Forward Pass."""
        out = x
        num_layers = len(self.weights)
        for i in range(num_layers):
            out = F.linear(out, self.weights[i], self.biases[i])
            if i < num_layers - 1:
                out = F.silu(out)  # Swish / SiLU activation for C-infinity continuity
        return out

    def forward(self, x):
        """
        Expects x shape: [Batch, 25]
        Inputs: [Upper(8), Lower(8), LE_weight(1), TE_thick(1), sin(2a), cos(a), 1-cos(a)^2, Re_scaled, n_crit_scaled, xtr_u, xtr_l]
        """
        # --- Standard Evaluation ---
        y = self._raw_net(x)
        y[:, 0] = y[:, 0] - self._sq_mahalanobis(x) / (2 * self.n_inputs)
        
        # --- Symmetrical Evaluation (Alpha Invariance) ---
        x_flipped = x.clone()
        x_flipped[:, :8] = -x[:, 8:16]       # switch lower with flipped upper
        x_flipped[:, 8:16] = -x[:, :8]       # switch upper with flipped lower
        x_flipped[:, 16] = -x[:, 16]         # flip LE weight
        x_flipped[:, 18] = -x[:, 18]         # flip sin(2a)
        x_flipped[:, 23] = x[:, 24]          # flip xtr_upper with xtr_lower
        x_flipped[:, 24] = x[:, 23]          # flip xtr_lower with xtr_upper
        
        y_flipped = self._raw_net(x_flipped)
        y_flipped[:, 0] = y_flipped[:, 0] - self._sq_mahalanobis(x_flipped) / (2 * self.n_inputs)
        
        # Un-flip the outputs
        y_unflipped = y_flipped.clone()
        y_unflipped[:, 1] *= -1  # CL
        y_unflipped[:, 3] *= -1  # CM
        y_unflipped[:, 4] = y_flipped[:, 5]  # switch Top_Xtr with Bot_Xtr
        y_unflipped[:, 5] = y_flipped[:, 4]  
        
        # Switch boundary layer parameters (Ret, H, ue/vinf)
        y_unflipped[:, 6:70] = y_flipped[:, 102:166]
        y_unflipped[:, 70:102] = -y_flipped[:, 166:198]
        y_unflipped[:, 102:166] = y_flipped[:, 6:70]
        y_unflipped[:, 166:198] = -y_flipped[:, 70:102]

        # --- FUSE ---
        y_fused = (y + y_unflipped) / 2.0
        
        # Physical descaling of critical scalars
        analysis_confidence = torch.sigmoid(y_fused[:, 0])
        CL = y_fused[:, 1] / 2.0
        CD = torch.exp((y_fused[:, 2] - 2.0) * 2.0)
        CM = y_fused[:, 3] / 20.0
        Top_Xtr = torch.clamp(y_fused[:, 4], 0.0, 1.0)
        Bot_Xtr = torch.clamp(y_fused[:, 5], 0.0, 1.0)
        
        # Combine into a single tensor for easy batching: [Batch, 6]
        # (We exclude the massive BL arrays here to keep the Genetic Algorithm blazing fast, 
        # but they are available in y_fused if needed).
        scalars = torch.stack([analysis_confidence, CL, CD, CM, Top_Xtr, Bot_Xtr], dim=1)
        return scalars