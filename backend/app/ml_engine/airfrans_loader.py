import torch
from torch.utils.data import Dataset
from torch_geometric.data import Data
import pandas as pd
import numpy as np

class AeroMLV7ScalarDataset(Dataset):
    """ Feeds the ResNet for Cl, Cd, Cm prediction """
    def __init__(self, csv_path):
        self.df = pd.read_csv(csv_path)
        self.x_cols = [f'cst_{i}' for i in range(16)] + ['alpha', 'reynolds']
        self.y_cols = ['cl', 'cd', 'cm']
        
        self.X = torch.tensor(self.df[self.x_cols].values, dtype=torch.float32)
        # Normalize Reynolds
        self.X[:, 17] = self.X[:, 17] / 1e6 
        
        self.Y = torch.tensor(self.df[self.y_cols].values, dtype=torch.float32)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.Y[idx]

class AeroMLV7GraphDataset(Dataset):
    """ Feeds both GraphSAGE (GNN) and Multi-Head DeepONet """
    def __init__(self, pt_path):
        self.data_list = torch.load(pt_path)

    def __len__(self):
        return len(self.data_list)

    def __getitem__(self, idx):
        item = self.data_list[idx]
        
        # Branch Input (Global shape and conditions) -> Shape: (18)
        # [16 CST, alpha, reynolds]
        branch_in = torch.cat([item['cst'], item['cond']])
        
        # Targets: [Ux, Uy, p, nu_t] -> Shape: (N_points, 4)
        targets = torch.cat([
            item['velocity'], 
            item['pressure'], 
            item['nu_t']
        ], dim=1)
        
        # Data for DeepONet
        deeponet_data = {
            'branch': branch_in,
            'trunk': item['pos'],
            'y': targets
        }
        
        # Data for GraphSAGE (PyTorch Geometric object)
        # We append the global branch data to the node features in the model,
        # so initially 'x' is just the coordinates.
        gnn_data = Data(
            x=item['pos'], 
            edge_index=item['edge_index'], 
            y=targets,
            global_context=branch_in.unsqueeze(0) 
        )
        
        return deeponet_data, gnn_data