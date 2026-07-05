# backend/app/api/vision.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.ml_engine.vision_processor import AeroVisionEngine
from app.api.auth import get_current_user

# FIX: Removed the double prefix so it aligns perfectly with main.py
router = APIRouter()
vision_engine = AeroVisionEngine()

@router.post("/extract")
async def extract_geometry_from_image(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, detail="Invalid file type. Upload PNG or JPEG.")
    
    try:
        contents = await file.read()
        result = vision_engine.process_image(contents)
        result["filename"] = file.filename
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision Processing Failed: {str(e)}")