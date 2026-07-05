from pydantic import BaseModel
from typing import List, Optional

# Shared properties
class AirfoilBase(BaseModel):
    name: str

# Properties to receive on creation
class AirfoilCreate(AirfoilBase):
    cst_coefficients: List[float]
    coordinates: List[List[float]]

# Properties to return to the client
class AirfoilResponse(AirfoilBase):
    id: int
    cst_coefficients: List[float]
    # We might exclude massive coordinates lists in list views for speed
    
    class Config:
        from_attributes = True

class SimulationBase(BaseModel):
    reynolds: float
    alpha: float
    cl: float
    cd: float
    cm: float

class SimulationResponse(SimulationBase):
    id: int
    airfoil_id: int

    class Config:
        from_attributes = True