import cv2
import numpy as np
import base64
from scipy.optimize import least_squares
import math

class AeroVisionEngine:
    def __init__(self):
        self.n1 = 0.5
        self.n2 = 1.0

    def _class_function(self, x):
        # CST Class function for rounded LE and sharp TE
        return (x**self.n1) * ((1.0 - x)**self.n2)

    def _bernstein_poly(self, n, v, x):
        return math.comb(n, v) * (x**v) * ((1.0 - x)**(n - v))

    def _shape_function(self, x, weights):
        n = len(weights) - 1
        S = np.zeros_like(x)
        for i, w in enumerate(weights):
            S += w * self._bernstein_poly(n, i, x)
        return S

    def _cst_curve(self, x, weights, dz_te=0):
        return self._class_function(x) * self._shape_function(x, weights) + x * dz_te

    def _fit_cst(self, x_data, y_data, n_weights=8):
        """Fits CST weights to a set of X, Y coordinates using Least Squares."""
        def residual(weights):
            return self._cst_curve(x_data, weights) - y_data
        
        # Initial guess: flat plate
        w0 = np.zeros(n_weights)
        res = least_squares(residual, w0, method='lm')
        return res.x.tolist()

    def process_image(self, image_bytes):
        # 1. Decode Image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Corrupted or unreadable image data.")
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Preprocessing & Edge Detection
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        edges = cv2.Canny(thresh, 50, 150)

        # 3. Find Contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            raise ValueError("No aerodynamic profile detected in image.")

        # Assume the largest contour is the airfoil
        main_contour = max(contours, key=cv2.contourArea)
        pts = main_contour.reshape(-1, 2)

        # Draw overlay for UI feedback (Machine Vision View)
        overlay = img.copy()
        cv2.drawContours(overlay, [main_contour], -1, (0, 255, 194), 3) # AeroML Cyan
        
        # Encode overlay to base64 for frontend
        _, buffer = cv2.imencode('.png', overlay)
        b64_image = base64.b64encode(buffer).decode('utf-8')

        # 4. Normalize to Chord [0, 1]
        x_coords = pts[:, 0]
        y_coords = pts[:, 1]
        
        min_x, max_x = np.min(x_coords), np.max(x_coords)
        chord_px = max_x - min_x
        
        if chord_px == 0:
            raise ValueError("Invalid geometry: Zero chord length.")

        x_norm = (x_coords - min_x) / chord_px
        # Y is inverted in image coordinates, so we flip it and scale by chord
        y_norm = -(y_coords - np.mean(y_coords)) / chord_px

        # 5. Split into Upper and Lower Surfaces
        le_idx = np.argmin(x_norm)
        
        # Roll array to start at LE
        x_norm = np.roll(x_norm, -le_idx)
        y_norm = np.roll(y_norm, -le_idx)
        
        te_idx = np.argmax(x_norm)
        
        upper_x = x_norm[:te_idx+1]
        upper_y = y_norm[:te_idx+1]
        lower_x = np.concatenate(([x_norm[0]], x_norm[te_idx:][::-1]))
        lower_y = np.concatenate(([y_norm[0]], y_norm[te_idx:][::-1]))

        # Clean duplicates and sort for fitting
        u_idx = np.argsort(upper_x)
        upper_x, upper_y = upper_x[u_idx], upper_y[u_idx]
        
        l_idx = np.argsort(lower_x)
        lower_x, lower_y = lower_x[l_idx], lower_y[l_idx]

        # Ensure unique x values for scipy least_squares
        upper_x, u_unique_idx = np.unique(upper_x, return_index=True)
        upper_y = upper_y[u_unique_idx]
        
        lower_x, l_unique_idx = np.unique(lower_x, return_index=True)
        lower_y = lower_y[l_unique_idx]

        # 6. Mathematical CST Fitting
        cst_upper = self._fit_cst(upper_x, upper_y, 8)
        cst_lower = self._fit_cst(lower_x, lower_y, 8)

        thickness = np.max(upper_y) - np.min(lower_y)
        
        return {
            "cst_coefficients": cst_upper + cst_lower,
            "metrics": {
                "detected_chord_px": float(chord_px),
                "estimated_thickness": float(thickness)
            },
            "overlay_image": f"data:image/png;base64,{b64_image}"
        }