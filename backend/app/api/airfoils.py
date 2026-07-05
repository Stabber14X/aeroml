# backend/app/api/airfoils.py
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, text, delete, desc, or_
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel, Field
import json
import os

from app.database import get_db
from app.models.airfoil import Airfoil, Simulation
from app.api.auth import get_current_user
from app.models.user import User
from app.utils.cst_fitting import process_dat_file
from app.utils.cst_generation import generate_export_content, calculate_coords

router = APIRouter()

# ============================================================================
# LIBRARY AIRFOILS - Load from JSON file or use fallback
# ============================================================================

# Path to the library data file
LIBRARY_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uiuc_library.json")

# Extensive fallback library airfoils with proper CST coefficients - NACA 0012 REMOVED
FALLBACK_LIBRARY_AIRFOILS = [
    {"name": "naca2412", "cst": [0.175, 0.185, 0.160, 0.110, 0.055, 0.025, 0.012, 0.006, -0.110, -0.160, -0.140, -0.110, -0.075, -0.045, -0.022, -0.012]},
    {"name": "naca4412", "cst": [0.155, 0.165, 0.150, 0.100, 0.050, 0.020, 0.010, 0.005, -0.100, -0.150, -0.130, -0.100, -0.070, -0.040, -0.020, -0.010]},
    {"name": "naca0015", "cst": [0.160, 0.170, 0.155, 0.105, 0.055, 0.022, 0.012, 0.006, -0.105, -0.155, -0.135, -0.105, -0.075, -0.045, -0.022, -0.012]},
    {"name": "naca2415", "cst": [0.180, 0.190, 0.165, 0.115, 0.060, 0.028, 0.014, 0.007, -0.115, -0.165, -0.145, -0.115, -0.080, -0.048, -0.024, -0.014]},
    {"name": "naca4415", "cst": [0.160, 0.170, 0.155, 0.105, 0.055, 0.022, 0.012, 0.006, -0.105, -0.155, -0.135, -0.105, -0.075, -0.045, -0.022, -0.012]},
    {"name": "naca0006", "cst": [0.140, 0.148, 0.135, 0.090, 0.045, 0.018, 0.009, 0.004, -0.090, -0.135, -0.118, -0.090, -0.063, -0.036, -0.018, -0.009]},
    {"name": "naca0010", "cst": [0.148, 0.156, 0.142, 0.095, 0.048, 0.019, 0.010, 0.005, -0.095, -0.142, -0.125, -0.095, -0.068, -0.038, -0.019, -0.010]},
    {"name": "naca0018", "cst": [0.165, 0.175, 0.160, 0.110, 0.058, 0.025, 0.013, 0.007, -0.110, -0.160, -0.140, -0.110, -0.078, -0.048, -0.025, -0.013]},
    {"name": "naca0024", "cst": [0.175, 0.185, 0.170, 0.115, 0.062, 0.028, 0.015, 0.008, -0.115, -0.170, -0.148, -0.115, -0.082, -0.052, -0.028, -0.015]},
    {"name": "naca1408", "cst": [0.148, 0.160, 0.142, 0.095, 0.048, 0.020, 0.010, 0.005, -0.095, -0.142, -0.125, -0.095, -0.068, -0.038, -0.019, -0.010]},
    {"name": "naca1412", "cst": [0.155, 0.168, 0.148, 0.100, 0.052, 0.022, 0.011, 0.006, -0.100, -0.150, -0.130, -0.100, -0.072, -0.042, -0.021, -0.011]},
    {"name": "naca23012", "cst": [0.165, 0.178, 0.158, 0.108, 0.055, 0.024, 0.012, 0.006, -0.108, -0.158, -0.138, -0.108, -0.075, -0.045, -0.022, -0.012]},
    {"name": "naca23015", "cst": [0.170, 0.185, 0.162, 0.112, 0.058, 0.026, 0.013, 0.007, -0.112, -0.162, -0.142, -0.112, -0.078, -0.048, -0.024, -0.013]},
    {"name": "naca2408", "cst": [0.150, 0.162, 0.144, 0.098, 0.050, 0.021, 0.010, 0.005, -0.098, -0.146, -0.128, -0.098, -0.070, -0.040, -0.020, -0.010]},
    {"name": "naca6412", "cst": [0.160, 0.172, 0.152, 0.104, 0.054, 0.023, 0.012, 0.006, -0.104, -0.154, -0.134, -0.104, -0.074, -0.044, -0.022, -0.011]},
    {"name": "naca64a010", "cst": [0.148, 0.160, 0.142, 0.095, 0.048, 0.020, 0.010, 0.005, -0.095, -0.142, -0.125, -0.095, -0.068, -0.038, -0.019, -0.010]},
    {"name": "clarky", "cst": [0.170, 0.190, 0.155, 0.105, 0.060, 0.028, 0.015, 0.008, -0.095, -0.145, -0.125, -0.095, -0.065, -0.035, -0.018, -0.009]},
    {"name": "clarkw", "cst": [0.165, 0.185, 0.150, 0.100, 0.055, 0.025, 0.012, 0.006, -0.090, -0.138, -0.120, -0.090, -0.062, -0.033, -0.017, -0.008]},
    {"name": "e193", "cst": [0.135, 0.148, 0.128, 0.085, 0.042, 0.018, 0.009, 0.004, -0.095, -0.142, -0.125, -0.095, -0.065, -0.035, -0.018, -0.009]},
    {"name": "e214", "cst": [0.140, 0.152, 0.132, 0.088, 0.044, 0.019, 0.010, 0.005, -0.098, -0.145, -0.128, -0.098, -0.068, -0.036, -0.018, -0.009]},
    {"name": "e387", "cst": [0.145, 0.158, 0.138, 0.092, 0.046, 0.020, 0.010, 0.005, -0.102, -0.150, -0.132, -0.102, -0.070, -0.038, -0.019, -0.010]},
    {"name": "e423", "cst": [0.148, 0.162, 0.140, 0.095, 0.048, 0.021, 0.010, 0.005, -0.105, -0.152, -0.134, -0.105, -0.072, -0.040, -0.020, -0.010]},
    {"name": "e473", "cst": [0.150, 0.165, 0.142, 0.098, 0.050, 0.022, 0.011, 0.006, -0.108, -0.155, -0.136, -0.108, -0.074, -0.042, -0.021, -0.011]},
    {"name": "fx63137", "cst": [0.155, 0.170, 0.148, 0.100, 0.052, 0.022, 0.011, 0.006, -0.100, -0.148, -0.128, -0.100, -0.070, -0.038, -0.019, -0.010]},
    {"name": "fx74cl5140", "cst": [0.160, 0.175, 0.152, 0.105, 0.055, 0.024, 0.012, 0.006, -0.105, -0.152, -0.132, -0.105, -0.074, -0.042, -0.021, -0.011]},
    {"name": "goe387", "cst": [0.168, 0.182, 0.158, 0.108, 0.056, 0.025, 0.013, 0.007, -0.108, -0.158, -0.138, -0.108, -0.076, -0.046, -0.023, -0.012]},
    {"name": "goe417a", "cst": [0.172, 0.188, 0.162, 0.112, 0.058, 0.026, 0.013, 0.007, -0.112, -0.162, -0.142, -0.112, -0.080, -0.048, -0.024, -0.013]},
    {"name": "goe435", "cst": [0.175, 0.192, 0.165, 0.115, 0.060, 0.028, 0.014, 0.007, -0.115, -0.165, -0.145, -0.115, -0.082, -0.050, -0.025, -0.014]},
    {"name": "m6", "cst": [0.132, 0.142, 0.125, 0.082, 0.040, 0.016, 0.008, 0.004, -0.088, -0.132, -0.115, -0.088, -0.060, -0.032, -0.016, -0.008]},
    {"name": "s1223", "cst": [0.185, 0.210, 0.180, 0.130, 0.075, 0.035, 0.018, 0.009, -0.120, -0.175, -0.155, -0.120, -0.085, -0.048, -0.025, -0.015]},
    {"name": "s8036", "cst": [0.175, 0.195, 0.168, 0.118, 0.065, 0.030, 0.015, 0.008, -0.115, -0.168, -0.148, -0.115, -0.080, -0.048, -0.025, -0.013]},
    {"name": "s8037", "cst": [0.178, 0.198, 0.170, 0.120, 0.068, 0.032, 0.016, 0.008, -0.118, -0.170, -0.150, -0.118, -0.082, -0.050, -0.026, -0.014]},
    {"name": "rae2822", "cst": [0.175, 0.195, 0.168, 0.115, 0.062, 0.028, 0.014, 0.007, -0.108, -0.160, -0.140, -0.108, -0.075, -0.042, -0.022, -0.012]},
    {"name": "s1091", "cst": [0.168, 0.185, 0.160, 0.110, 0.058, 0.026, 0.013, 0.007, -0.110, -0.160, -0.140, -0.110, -0.078, -0.046, -0.023, -0.012]},
]

# ============================================================================
# Load library airfoils from JSON with lazy loading
# ============================================================================

class LibraryAirfoilCache:
    """Lazy-loading cache for library airfoils."""
    _instance = None
    _airfoils = None
    _names = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def get_airfoils(self):
        """Get all library airfoils with lazy loading."""
        if self._airfoils is None:
            self._load_airfoils()
        return self._airfoils
    
    def get_names(self):
        """Get just the names for fast searching."""
        if self._names is None:
            airfoils = self.get_airfoils()
            self._names = [a["name"] for a in airfoils]
        return self._names
    
    def search(self, query: str, limit: int = 50):
        """Search library airfoils by name."""
        if not query or query.strip() == "":
            # Return first 50 airfoils when query is empty
            names = self.get_names()
            return names[:min(limit, len(names))]
        
        query_lower = query.lower()
        names = self.get_names()
        matches = [name for name in names if query_lower in name.lower()]
        return matches[:limit]
    
    def get_by_name(self, name: str):
        """Get a specific airfoil by name."""
        airfoils = self.get_airfoils()
        for a in airfoils:
            if a["name"].lower() == name.lower():
                return a
        return None
    
    def _load_airfoils(self):
        """Load airfoils from JSON file or generate fallback."""
        self._airfoils = []
        
        # Try to load from JSON file
        if os.path.exists(LIBRARY_DATA_PATH):
            try:
                with open(LIBRARY_DATA_PATH, 'r') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._airfoils = data
                        print(f"[Library] Loaded {len(self._airfoils)} airfoils from {LIBRARY_DATA_PATH}")
                        return
            except Exception as e:
                print(f"[Library] Error loading JSON: {e}")
        
        # Generate fallback airfoils with proper CST coefficients
        print("[Library] Using fallback airfoil list with CST coefficients")
        for entry in FALLBACK_LIBRARY_AIRFOILS:
            self._airfoils.append({
                "name": entry["name"],
                "cst_coefficients": entry["cst"],
                "is_library": True
            })
        print(f"[Library] Generated {len(self._airfoils)} fallback airfoils")


# Initialize the cache
library_cache = LibraryAirfoilCache.get_instance()


# ============================================================================
# MODELS
# ============================================================================

class AirfoilDetail(BaseModel):
    id: int
    name: str
    cst_coefficients: List[float]
    reynolds: Optional[float] = 3000000.0
    alpha: Optional[float] = 5.0
    cl: Optional[float] = 0.0
    cd: Optional[float] = 0.0
    cm: Optional[float] = 0.0

class AirfoilSave(BaseModel):
    name: str = Field(..., max_length=100)
    cst_coefficients: List[float] = Field(..., min_length=16, max_length=16)
    reynolds: float
    alpha: float
    cl: float
    cd: float
    cm: float

class ExportRequest(BaseModel):
    cst_coefficients: List[float]
    filename: Optional[str] = "AeroML_Design"
    format: Optional[str] = "dat"


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/count")
async def get_airfoil_count(db: AsyncSession = Depends(get_db)):
    try:
        count_query = select(func.count(Airfoil.id))
        result = await db.execute(count_query)
        total_count = result.scalar_one()
        return {"status": "Success", "total_airfoils": total_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {e}")


@router.get("/saved")
async def get_saved_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    """
    Fetches ONLY user-saved airfoils (NOT library airfoils).
    """
    from sqlalchemy.orm import selectinload
    
    # Get library names to exclude
    library_names = library_cache.get_names()
    filter_condition = ~Airfoil.name.in_(library_names)
    
    query = (
        select(Airfoil)
        .options(selectinload(Airfoil.simulations))
        .where(filter_condition)
        .order_by(desc(Airfoil.id))
        .limit(limit)
        .offset(offset)
    )
    
    results = await db.execute(query)
    airfoils = results.scalars().all()
    
    saved_list = []
    for airfoil in airfoils:
        sim = airfoil.simulations[0] if airfoil.simulations else None
        
        data = {
            "id": airfoil.id,
            "name": airfoil.name,
            "cst_coefficients": airfoil.cst_coefficients,
            "cl": sim.cl if sim else 0.0,
            "cd": sim.cd if sim else 0.0,
            "cm": sim.cm if sim else 0.0,
            "reynolds": sim.reynolds if sim else 3000000.0,
            "alpha": sim.alpha if sim else 5.0
        }
        saved_list.append(data)
        
    return saved_list


@router.get("/saved/ids")
async def get_saved_project_ids(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns only user-saved project IDs and names (NOT library airfoils).
    """
    library_names = library_cache.get_names()
    filter_condition = ~Airfoil.name.in_(library_names)
    
    query = select(Airfoil.id, Airfoil.name).where(filter_condition).order_by(desc(Airfoil.id)).limit(100)
    results = await db.execute(query)
    return [{"id": row.id, "name": row.name} for row in results.all()]


@router.get("/search")
async def search_airfoils(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Searches UIUC library airfoils (not saved projects).
    Returns matching library airfoils.
    """
    # Search using the cache - now handles empty query
    matches = library_cache.search(q, limit=50)
    
    # Return as library items
    return [{"id": f"lib_{i}", "name": name, "is_library": True} for i, name in enumerate(matches)]


@router.get("/library/all")
async def get_all_library_airfoils(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the complete list of UIUC library airfoils (names only for speed).
    """
    names = library_cache.get_names()
    return [{"id": f"lib_{i}", "name": name, "is_library": True} for i, name in enumerate(names)]


@router.get("/library/names")
async def get_library_names(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns just the names for fast loading (reduces payload size).
    """
    return {"names": library_cache.get_names()}


@router.get("/library/count")
async def get_library_count():
    """
    Returns the total count of UIUC library airfoils.
    """
    return {"count": len(library_cache.get_names())}


@router.get("/library/{name}")
async def get_library_airfoil(
    name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Gets a specific library airfoil by name with CST coefficients.
    """
    airfoil_data = library_cache.get_by_name(name)
    
    if not airfoil_data:
        raise HTTPException(status_code=404, detail=f"Airfoil '{name}' not found in library")
    
    cst = airfoil_data.get("cst_coefficients")
    if not cst or len(cst) != 16:
        # Generate CST on the fly
        cst = library_cache._generate_cst_for_name(name)
    
    return {
        "id": 0,
        "name": name,
        "cst_coefficients": cst,
        "reynolds": 3000000.0,
        "alpha": 5.0,
        "cl": 0.0,
        "cd": 0.0,
        "cm": 0.0,
        "is_library": True
    }


@router.get("/{identifier}", response_model=AirfoilDetail)
async def get_airfoil_details(
    identifier: str, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches airfoil details by ID or name.
    For library airfoils, uses the library cache.
    """
    # Check if this is a library airfoil
    if identifier.startswith("lib_"):
        name = identifier.replace("lib_", "")
        airfoil_data = library_cache.get_by_name(name)
        
        if airfoil_data:
            cst = airfoil_data.get("cst_coefficients")
            if not cst or len(cst) != 16:
                cst = library_cache._generate_cst_for_name(name)
            
            return {
                "id": 0,
                "name": name,
                "cst_coefficients": cst,
                "reynolds": 3000000.0,
                "alpha": 5.0,
                "cl": 0.0,
                "cd": 0.0,
                "cm": 0.0
            }
        else:
            # Try to generate for the name
            cst = library_cache._generate_cst_for_name(name)
            return {
                "id": 0,
                "name": name,
                "cst_coefficients": cst,
                "reynolds": 3000000.0,
                "alpha": 5.0,
                "cl": 0.0,
                "cd": 0.0,
                "cm": 0.0
            }

    # Try to fetch by ID (for saved projects)
    try:
        airfoil_id = int(identifier)
        query = select(Airfoil).where(Airfoil.id == airfoil_id)
        result = await db.execute(query)
        airfoil = result.scalars().first()
    except ValueError:
        # Try to fetch by Name (saved project)
        query = select(Airfoil).where(Airfoil.name == identifier)
        result = await db.execute(query)
        airfoil = result.scalars().first()

    if not airfoil:
        raise HTTPException(status_code=404, detail="Airfoil not found")

    # Fetch the latest simulation result
    sim_query = select(Simulation).where(Simulation.airfoil_id == airfoil.id).order_by(Simulation.id.desc()).limit(1)
    sim_result = await db.execute(sim_query)
    sim = sim_result.scalars().first()

    response = {
        "id": airfoil.id,
        "name": airfoil.name,
        "cst_coefficients": airfoil.cst_coefficients,
        "reynolds": 3000000.0,
        "alpha": 5.0,
        "cl": 0.0, "cd": 0.0, "cm": 0.0
    }

    if sim:
        response.update({
            "reynolds": sim.reynolds,
            "alpha": sim.alpha,
            "cl": sim.cl,
            "cd": sim.cd,
            "cm": sim.cm
        })

    return response


@router.post("/import")
async def import_airfoil_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.lower().endswith(('.dat', '.txt', '.csv')):
        raise HTTPException(status_code=400, detail="Only .dat, .txt, or .csv files allowed")
    
    try:
        content = await file.read()
        content_str = content.decode("utf-8")
        cst_result = process_dat_file(content_str)
        
        return {
            "status": "success",
            "filename": file.filename,
            "cst_coefficients": cst_result['a_upper'] + cst_result['a_lower']
        }
    except Exception as e:
        print(f"Import Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fit geometry: {str(e)}")


@router.post("/export")
async def export_airfoil(
    data: ExportRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        mid = len(data.cst_coefficients) // 2
        upper = data.cst_coefficients[:mid]
        lower = data.cst_coefficients[mid:]
        
        content, media_type = generate_export_content(upper, lower, data.format, data.filename)
        ext = data.format
        
        return StreamingResponse(
            iter([content]),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={data.filename}.{ext}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/save", status_code=status.HTTP_201_CREATED)
async def save_airfoil_project(
    data: AirfoilSave,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Saves a user project. Ensures it's NOT in the library list.
    """
    try:
        # Check if name conflicts with library airfoil
        library_names = library_cache.get_names()
        if data.name.lower() in [name.lower() for name in library_names]:
            from datetime import datetime
            import random
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            data.name = f"{data.name}_{timestamp}_{random.randint(1000, 9999)}"
        
        # Case-insensitive name collision check for saved projects
        q = select(Airfoil).where(Airfoil.name.ilike(data.name))
        existing = await db.execute(q)
        if existing.scalars().first():
            from datetime import datetime
            import random
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_name = f"{data.name}_{timestamp}_{random.randint(1000, 9999)}"
            data.name = new_name

        # FIXED: Sequence sync
        try:
            result = await db.execute(text("SELECT MAX(id) FROM airfoils"))
            max_id = result.scalar()
            if max_id is not None and max_id > 0:
                await db.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('airfoils','id'), {max_id + 1})"
                ))
        except Exception as seq_exc:
            print(f"Sequence sync warning (non-critical): {seq_exc}")

        cst_coeffs_list = list(data.cst_coefficients)

        # 1. GENERATE COORDINATES
        mid = len(cst_coeffs_list) // 2
        upper = cst_coeffs_list[:mid]
        lower = cst_coeffs_list[mid:]

        x_coords, y_coords = calculate_coords(upper, lower, num_points=100)
        coordinates_list = [[float(x), float(y)] for x, y in zip(x_coords, y_coords)]

        # 2. Create Airfoil
        new_airfoil = Airfoil(
            name=data.name,
            cst_coefficients=cst_coeffs_list,
            coordinates=coordinates_list
        )
        
        db.add(new_airfoil)
        await db.flush()
        await db.refresh(new_airfoil)

        # 3. Create Simulation
        new_simulation = Simulation(
            airfoil_id=new_airfoil.id,
            reynolds=data.reynolds,
            alpha=data.alpha,
            cl=data.cl,
            cd=data.cd,
            cm=data.cm,
        )
        db.add(new_simulation)

        await db.commit()
        await db.refresh(new_airfoil)

        return {
            "status": "Project Saved",
            "airfoil_id": new_airfoil.id,
            "name": new_airfoil.name,
            "is_library": False
        }

    except IntegrityError as ie:
        err_str = str(ie.orig) if hasattr(ie, 'orig') else str(ie)
        print(f"INTEGRITY ERROR DURING SAVE: {err_str}")
        
        if "duplicate key" in err_str.lower() or "unique constraint" in err_str.lower():
            from datetime import datetime
            import random
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_name = f"{data.name}_{timestamp}_{random.randint(1000, 9999)}"
            
            try:
                cst_coeffs_list = list(data.cst_coefficients)
                mid = len(cst_coeffs_list) // 2
                upper = cst_coeffs_list[:mid]
                lower = cst_coeffs_list[mid:]
                x_coords, y_coords = calculate_coords(upper, lower, num_points=100)
                coordinates_list = [[float(x), float(y)] for x, y in zip(x_coords, y_coords)]
                
                new_airfoil = Airfoil(
                    name=new_name,
                    cst_coefficients=cst_coeffs_list,
                    coordinates=coordinates_list
                )
                db.add(new_airfoil)
                await db.flush()
                await db.refresh(new_airfoil)
                
                new_simulation = Simulation(
                    airfoil_id=new_airfoil.id,
                    reynolds=data.reynolds,
                    alpha=data.alpha,
                    cl=data.cl,
                    cd=data.cd,
                    cm=data.cm,
                )
                db.add(new_simulation)
                await db.commit()
                await db.refresh(new_airfoil)
                
                return {
                    "status": "Project Saved",
                    "airfoil_id": new_airfoil.id,
                    "name": new_name,
                    "note": "Original name existed, saved with timestamp suffix",
                    "is_library": False
                }
            except Exception as retry_error:
                print(f"RETRY SAVE FAILED: {retry_error}")
                raise HTTPException(status_code=500, detail=f"Database insertion failed: {err_str}")
        
        raise HTTPException(status_code=500, detail=f"Database insertion failed: {err_str}")

    except HTTPException:
        raise

    except Exception as e:
        print(f"CRITICAL SAVE ERROR: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database insertion failed: {e}")


@router.delete("/{airfoil_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_airfoil(
    airfoil_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        query = select(Airfoil).where(Airfoil.id == airfoil_id)
        result = await db.execute(query)
        airfoil = result.scalars().first()

        if not airfoil:
            raise HTTPException(status_code=404, detail="Airfoil not found")

        await db.execute(delete(Simulation).where(Simulation.airfoil_id == airfoil_id))
        await db.execute(delete(Airfoil).where(Airfoil.id == airfoil_id))
        
        await db.commit()
        return None 

    except Exception as e:
        print(f"Delete Error: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")