# backend/app/utils/openfoam_builder.py
import numpy as np
from struct import pack
import os

def generate_airfoil_stl(coords: list, output_path: str, span: float = 0.2):
    """Generates a 3D binary STL with increased span for mesher stability."""
    pts = np.array(coords)
    if not np.allclose(pts[0], pts[-1]):
        pts = np.vstack([pts, pts[0]])
        
    num_pts = len(pts)
    # Center the span on Z-axis for symmetry
    z_start = -span/2
    z_end = span/2
    
    vertices_z0 = np.column_stack((pts[:, 0], pts[:, 1], np.full(num_pts, z_start)))
    vertices_z1 = np.column_stack((pts[:, 0], pts[:, 1], np.full(num_pts, z_end)))
    
    triangles = []
    for i in range(num_pts - 1):
        p1, p2, p3, p4 = vertices_z0[i], vertices_z0[i+1], vertices_z1[i], vertices_z1[i+1]
        triangles.append([p1, p2, p3])
        triangles.append([p2, p4, p3])
        
    root_center = vertices_z0[0]
    tip_center = vertices_z1[0]
    for i in range(1, num_pts - 2):
        triangles.append([root_center, vertices_z0[i+1], vertices_z0[i]])
        triangles.append([tip_center, vertices_z1[i], vertices_z1[i+1]])

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(b'\0' * 80)
        f.write(pack('<I', len(triangles)))
        for tri in triangles:
            n = np.cross(tri[1]-tri[0], tri[2]-tri[0])
            norm = np.linalg.norm(n)
            n = n/norm if norm > 0 else np.zeros(3)
            f.write(pack('<3f', *n))
            for v in tri: f.write(pack('<3f', *v))
            f.write(pack('<H', 0))
    return output_path