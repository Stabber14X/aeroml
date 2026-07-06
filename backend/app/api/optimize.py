# backend/app/api/optimize.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Any

from app.tasks.pareto import run_pareto_optimization
from app.tasks.openfoam_task import run_digital_twin
from app.tasks.gradient_optimizer import run_gradient_optimization 
from app.celery_app import celery_app
from app.api.auth import get_current_user
from celery.result import AsyncResult

router = APIRouter()

# --- SCHEMAS ---
class AnalysisInput(BaseModel):
    cst_coefficients: List[float]
    reynolds: float
    alpha: float

class TaskStatus(BaseModel):
    task_id: str
    status: str
    message: str
    progress: Optional[float] = 0.0
    result: Optional[Any] = None

class OptimizationRequest(BaseModel):
    initial_cst: List[float]
    reynolds: float
    alpha: float
    generations: Optional[int] = 20
    target_cl: Optional[float] = 1.0
    target_thickness: Optional[float] = 0.12
    mach: Optional[float] = 0.0

class ParetoRequest(BaseModel):
    initial_cst: List[float]
    reynolds: float
    alpha: float
    target_cl: float = 0.8
    target_thickness: float = 0.12
    thickness_tolerance: float = 0.02
    min_area: float = 0.05
    min_cm: float = -0.15
    pop_size: int = 500
    generations: int = 20

class VerifyRequest(BaseModel):
    cst_coefficients: List[float]
    reynolds: float
    alpha: float


# --- SHARED IMPLEMENTATION ---

async def _start_optimization_impl(data: OptimizationRequest, user):
    """
    Core optimization implementation shared by both routes.
    """
    task = run_gradient_optimization.delay(**data.dict())
    return {"message": "Gradient Optimization started", "task_id": task.id}

async def _start_pareto_impl(data: ParetoRequest, user):
    """
    Core Pareto implementation shared by both routes.
    """
    try:
        task = run_pareto_optimization.delay(
            data.initial_cst, data.reynolds, data.alpha, data.target_cl, 
            data.target_thickness, data.thickness_tolerance, data.min_area, 
            data.min_cm, data.pop_size, data.generations
        )
        return {"message": "Pareto optimization started", "task_id": task.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _get_task_status_impl(task_id: str, user):
    """
    Core task status implementation shared by both routes.
    """
    task_result = AsyncResult(task_id)
    response = {"task_id": task_id, "status": task_result.status, "message": "Processing..."}
    
    if task_result.state == 'PENDING':
        response["message"] = "Task is waiting in queue..."
    elif task_result.state == 'PROGRESS':
        response.update(task_result.info) 
    elif task_result.state == 'SUCCESS':
        response["status"] = "COMPLETED"
        response["message"] = "Task Complete"
        response["result"] = task_result.result
    elif task_result.state == 'FAILURE':
        response["message"] = str(task_result.info)
        
    return response

async def _start_verification_impl(data: VerifyRequest, user):
    """
    Core verification implementation shared by both routes.
    """
    task = run_digital_twin.delay(data.cst_coefficients, data.reynolds, data.alpha)
    return {"message": "Verification started", "task_id": task.id}

async def _start_inverse_impl(data: dict, user):
    """
    Core inverse design implementation shared by both routes.
    """
    task = run_gradient_optimization.delay(**data)
    return {"message": "AeroSandbox Gradient Design started", "task_id": task.id}


# ============================================================================
# ENDPOINTS WITH TRAILING SLASH
# ============================================================================

@router.post("/")
async def start_optimization(data: OptimizationRequest, user=Depends(get_current_user)):
    """
    Workbench Optimization: Gradient-based optimization.
    """
    return await _start_optimization_impl(data, user)

@router.post("/pareto/")
async def start_pareto(data: ParetoRequest, user=Depends(get_current_user)):
    """
    Pareto Optimization: NSGA-II multi-objective optimization.
    """
    return await _start_pareto_impl(data, user)

@router.post("/verify/")
async def start_verification(data: VerifyRequest, user=Depends(get_current_user)):
    """
    Digital Twin Verification: Compares NeuralFoil predictions with GraphSAGE.
    """
    return await _start_verification_impl(data, user)

@router.post("/inverse/")
async def start_inverse(data: dict, user=Depends(get_current_user)):
    """
    Inverse Design: AeroSandbox Opti Integration.
    """
    return await _start_inverse_impl(data, user)

@router.get("/{task_id}/")
async def get_task_status(task_id: str, user=Depends(get_current_user)):
    """
    Get status of a task by ID.
    """
    return await _get_task_status_impl(task_id, user)


# ============================================================================
# ENDPOINTS WITHOUT TRAILING SLASH (TO PREVENT 307 REDIRECTS)
# ============================================================================

@router.post("")
async def start_optimization_no_slash(data: OptimizationRequest, user=Depends(get_current_user)):
    return await _start_optimization_impl(data, user)

@router.post("/pareto")
async def start_pareto_no_slash(data: ParetoRequest, user=Depends(get_current_user)):
    return await _start_pareto_impl(data, user)

@router.post("/verify")
async def start_verification_no_slash(data: VerifyRequest, user=Depends(get_current_user)):
    return await _start_verification_impl(data, user)

@router.post("/inverse")
async def start_inverse_no_slash(data: dict, user=Depends(get_current_user)):
    return await _start_inverse_impl(data, user)

@router.get("/{task_id}")
async def get_task_status_no_slash(task_id: str, user=Depends(get_current_user)):
    return await _get_task_status_impl(task_id, user)