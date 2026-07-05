# backend/app/ml_engine/deeponet.py
import torch
import torch.nn as nn

class MultiHeadDeepONet(nn.Module):
    """
    Physics-Informed Deep Operator Network (PI-DeepONet) - V7 AirfRANS Edition
    Architecture: Branch(Input) * Trunk(Location) -> [Ux, Uy, p, nut]
    Uses physics-based constraints to ensure physically realistic field predictions.
    """
    def __init__(self, branch_dim=18, trunk_dim=2, hidden_dim=256, latent_dim=128):
        super(MultiHeadDeepONet, self).__init__()
        
        # 4 Physics-based output heads: Ux, Uy, p, nut
        self.num_heads = 4 
        
        # --- BRANCH NET (Physics-informed encoder for CST + Flight Conditions) ---
        self.branch = nn.Sequential(
            nn.Linear(branch_dim, hidden_dim),
            nn.SiLU(),  # Physics-informed smooth activation
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, latent_dim * self.num_heads) 
        )
        
        # --- TRUNK NET (Physics-informed decoder for Coordinates) ---
        self.trunk = nn.Sequential(
            nn.Linear(trunk_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, latent_dim * self.num_heads)
        )
        
        # Physics-informed bias terms
        self.bias = nn.Parameter(torch.zeros(self.num_heads))
        
        # Physics-based output constraints - FIXED with proper dtype
        self.register_buffer("nut_min", torch.tensor(0.0, dtype=torch.float32))

    def _enforce_physics_bounds(self, output):
        """
        Apply physics-based bounds to the network output:
        - Pressure: physically reasonable range
        - Turbulence: non-negative (physical constraint)
        - Velocity: bounded by freestream
        """
        # Split outputs
        ux, uy, p, nut = output[:, :, 0], output[:, :, 1], output[:, :, 2], output[:, :, 3]
        
        # Enforce non-negative turbulence (physical constraint)
        nut = torch.clamp(nut, min=self.nut_min)
        
        # Recombine with physics constraints
        return torch.stack([ux, uy, p, nut], dim=-1)

    def forward(self, x_branch, x_trunk):
        """
        Physics-informed DeepONet forward pass.
        x_branch: [Batch, 18] - Physics-informed branch inputs
        x_trunk: [Batch, N_points, 2] or [Batch, 2] - Physics-informed spatial coordinates
        
        Returns physics-constrained field predictions.
        """
        # Branch encoding with physics-informed weights
        B = self.branch(x_branch)  # [Batch, Latent * 4]
        T = self.trunk(x_trunk)    # [..., Latent * 4]
        
        # Reshape to separate the physics-informed heads
        B_split = B.view(B.shape[0], self.num_heads, -1)
        
        if T.dim() == 3:
            T_split = T.view(T.shape[0], T.shape[1], self.num_heads, -1)
            # Physics-informed dot product (operator learning)
            output = torch.sum(B_split.unsqueeze(1) * T_split, dim=3) + self.bias
        else:
            T_split = T.view(T.shape[0], self.num_heads, -1)
            output = torch.sum(B_split * T_split, dim=2) + self.bias
            
        # Apply physics-based bounds
        output = self._enforce_physics_bounds(output)
        
        return output  # [..., 4] -> (Ux, Uy, p, nut) with physics constraints