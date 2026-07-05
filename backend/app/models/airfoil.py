from sqlalchemy import Column, Integer, String, Float, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY 
from app.database import Base

class Airfoil(Base):
    __tablename__ = "airfoils"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    
    # CRITICAL FIX: Changed from JSON to native ARRAY(Float) 
    cst_coefficients = Column(ARRAY(Float))
    
    # Stores the raw x,y coordinates [[x1,y1], [x2,y2]...]
    coordinates = Column(JSON)

    # Relationship to simulations
    simulations = relationship("Simulation", back_populates="airfoil")

class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    airfoil_id = Column(Integer, ForeignKey("airfoils.id"))
    
    reynolds = Column(Float)
    alpha = Column(Float)
    
    # Physics Outputs
    cl = Column(Float)
    cd = Column(Float)
    cm = Column(Float)

    airfoil = relationship("Airfoil", back_populates="simulations")