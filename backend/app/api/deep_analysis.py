# backend/app/api/deep_analysis.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import traceback

from app.api.auth import get_current_user
from app.models.user import User

# Import the new Sovereign Engines
from app.ml_engine.advanced_analytics import AnalyticalCalculusEngine
from app.ml_engine.plot_generator import ScientificPlotGenerator
from app.ml_engine.dossier_generator import DossierGenerator

router = APIRouter()

class DeepAnalysisRequest(BaseModel):
    cst_coefficients: List[float]
    reynolds: float
    alpha: float
    mach: Optional[float] = 0.0

@router.post("/generate-dossier")
async def generate_engineering_dossier(
    data: DeepAnalysisRequest, 
    current_user: User = Depends(get_current_user)
):
    """
    Phase 4: Master Orchestrator.
    Takes geometry and flight conditions, runs the 60-parameter calculus,
    generates 12 high-res PNG plots, compiles the 100+ page PDF, and streams it back.
    """
    if len(data.cst_coefficients) != 16:
        raise HTTPException(status_code=400, detail="CST array must contain exactly 16 coefficients.")

    try:
        print(f"[DOSSIER ENGINE] Initiating Phase 1: Analytical Calculus...")
        # 1. Execute Mathematical Framework
        analytics_engine = AnalyticalCalculusEngine(
            cst_array=data.cst_coefficients,
            reynolds=data.reynolds,
            alpha=data.alpha,
            mach=data.mach
        )
        analytics_results = analytics_engine.execute_full_framework()

        print(f"[DOSSIER ENGINE] Initiating Phase 2: Scientific Graphics Rendering...")
        # 2. Render 300-DPI PNGs via Matplotlib
        plot_engine = ScientificPlotGenerator(analytics_engine)
        image_plots = plot_engine.generate_all_plots()

        print(f"[DOSSIER ENGINE] Initiating Phase 3: Compiling ReportLab PDF...")
        # 3. Assemble PDF Dossier (Passing image_plots instead of svg_plots)
        dossier_engine = DossierGenerator(
            analytics_results=analytics_results,
            image_plots=image_plots,
            cst_array=data.cst_coefficients,
            alpha=data.alpha,
            reynolds=data.reynolds,
            mach=data.mach
        )
        pdf_buffer = dossier_engine.generate_dossier()

        print(f"[DOSSIER ENGINE] Success. Streaming massive multi-page PDF to client.")
        
        # 4. Stream Binary Response
        hash_id = analytics_results['Certification']['SHA_256_Hash'][:8]
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="AeroML_Sovereign_Dossier_{hash_id}.pdf"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[CRITICAL ERROR] Dossier Generation Failed:\n{tb}")
        raise HTTPException(status_code=500, detail=f"Sovereign Engine Failure: {str(e)}")