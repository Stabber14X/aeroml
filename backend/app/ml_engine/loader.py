# backend/app/ml_engine/loader.py
import torch
import os
import sys

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from app.ml_engine.core.neuralfoil.model import NeuralFoilCore
from app.ml_engine.deeponet import MultiHeadDeepONet

class ModelManager:
    _instance = None

    def __init__(self):
        self.neuralfoil = None
        self.deeponet = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        self.field_scaler = None
        self.field_mean = None
        self.field_std = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None: 
            cls._instance = cls()
        return cls._instance

    def load_artifacts(self):
        print("--- [LOADER] INITIALIZING AEROML: NEURALFOIL ASSIMILATION ---")
        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "trained_models"))
        print(f"[LOADER] Model directory: {model_dir}")
        
        # A. Load NeuralFoil (CRITICAL - Must work)
        try:
            self.neuralfoil = NeuralFoilCore(model_size="xxxlarge", models_dir=model_dir).to(self.device)
            self.neuralfoil.eval() 
            print("[OK] NeuralFoil 'xxxlarge' Sovereign Core loaded successfully.")
        except Exception as e:
            print(f"[ERR] NeuralFoil load failed: {e}")
            # Don't raise, let it try to continue
        
        # B. Load DeepONet (OPTIONAL - Skip if fails)
        try:
            self.deeponet = MultiHeadDeepONet().to(self.device)
            path = os.path.join(model_dir, "deeponet_v7.pth")
            print(f"[LOADER] Looking for DeepONet at: {path}")
            if os.path.exists(path):
                state_dict = torch.load(path, map_location=self.device)
                self.deeponet.load_state_dict(state_dict, strict=False)
                self.deeponet.eval()
                print("[OK] DeepONet model loaded (strict=False).")
                
                # Load field scaler
                scaler_path = os.path.join(model_dir, "field_scaler.pt")
                print(f"[LOADER] Looking for field scaler at: {scaler_path}")
                if os.path.exists(scaler_path):
                    self.field_scaler = torch.load(scaler_path, map_location=self.device)
                    self.field_mean = self.field_scaler['mean']
                    self.field_std = self.field_scaler['std']
                    print(f"[OK] Field scaler loaded.")
                else:
                    print("[WARN] field_scaler.pt not found. Creating default scaler.")
                    self.field_mean = torch.zeros(4, device=self.device)
                    self.field_std = torch.ones(4, device=self.device)
                    self.field_scaler = {'mean': self.field_mean, 'std': self.field_std}
            else:
                print(f"[WARN] DeepONet model not found at: {path}")
                self.deeponet = None
                self.field_mean = torch.zeros(4, device=self.device)
                self.field_std = torch.ones(4, device=self.device)
                self.field_scaler = {'mean': self.field_mean, 'std': self.field_std}
        except Exception as e:
            print(f"[WARN] DeepONet load failed (non-critical): {e}")
            self.deeponet = None
            self.field_mean = torch.zeros(4, device=self.device)
            self.field_std = torch.ones(4, device=self.device)
            self.field_scaler = {'mean': self.field_mean, 'std': self.field_std}

ai_brain = ModelManager.get_instance()
