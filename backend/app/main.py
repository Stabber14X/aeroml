# backend/app/main.py
# COMPLETE IMPLEMENTATION - NOTHING SKIPPED

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time
import logging

from app.database import engine, Base, run_migrations
from app.ml_engine.loader import ai_brain
from app.api import (
    auth, airfoils, predict, optimize, geometry, mission,
    analysis, deep_analysis, aerosage, vision, finite_wing,
    admin, payments
)
from app.middleware.rate_limit import limiter, setup_rate_limiting, rate_limit
from app.middleware.subscription import subscription_middleware

# ─── LOGGING SETUP ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ─── LIFESPAN MANAGER ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - runs on startup and shutdown"""
    
    print("\n" + "=" * 60)
    print("🚀 AEROML V7: INITIALIZING SOVEREIGN CORE")
    print("=" * 60)

    print("[1/6] Running Database Migrations (SKIPPED FOR NOW)...")
    try:
        await run_migrations()
        print("✅ Database migrations completed")
    except Exception as e:
        print(f"⚠️ Migration warning (continuing): {e}")

    print("[2/6] Syncing Relational Database Schema...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database schema synced")
    except Exception as e:
        print(f"⚠️ Schema sync warning: {e}")

    print("[3/6] Initializing Admin Accounts...")
    try:
        from app.utils.admin_init import init_admin_accounts
        await init_admin_accounts()
        print("✅ Admin accounts initialized")
    except Exception as e:
        print(f"⚠️ Admin init warning: {e}")

    print("[4/6] Loading PyTorch Tensor Cores...")
    try:
        ai_brain.load_artifacts()
        print(f"✅ AI Brain Online. Device: {ai_brain.device}")
    except Exception as e:
        print(f"⚠️ AI Brain warning: {e}")

    print("[5/6] Setting up Rate Limiting...")
    try:
        setup_rate_limiting(app)
        print("✅ Rate limiting configured")
    except Exception as e:
        print(f"⚠️ Rate limiting warning: {e}")

    print("[6/6] Validating Admin Accounts...")
    try:
        from app.utils.admin_init import validate_admin_accounts
        await validate_admin_accounts()
        print("✅ Admin accounts validated")
    except Exception as e:
        print(f"⚠️ Admin validation warning: {e}")

    print("=" * 60)
    print("🟢 SYSTEM ONLINE AND ACCEPTING KINEMATIC REQUESTS")
    print("=" * 60 + "\n")

    yield

    print("🔴 SYSTEM SHUTDOWN INITIATED")
    await engine.dispose()

# ─── APP INITIALIZATION ────────────────────────────────────────────────────

app = FastAPI(
    title="AeroML V7 Core API",
    description="Industrial Aerodynamics & Structural Analysis Engine",
    version="7.0.0",
    lifespan=lifespan,
)

# ─── MIDDLEWARE ORDER (CRITICAL) ─────────────────────────────────────────

# 1. Subscription middleware (checks auth and subscription)
app.middleware("http")(subscription_middleware)

# 2. CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Process time middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# ─── REGISTER ALL ROUTERS ──────────────────────────────────────────────────

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(payments.router, tags=["Payments"])
app.include_router(airfoils.router, prefix="/airfoils", tags=["Geometry & Database"])
app.include_router(predict.router, prefix="/predict", tags=["NeuralFoil Inference"])
app.include_router(analysis.router, prefix="/analysis", tags=["Analysis"])
app.include_router(optimize.router, prefix="/optimize", tags=["Optimization"])
app.include_router(geometry.router, prefix="/geometry", tags=["Kinematic Morphing"])
app.include_router(mission.router, prefix="/mission", tags=["Transonic Sweeps"])
app.include_router(deep_analysis.router, prefix="/deep-analysis", tags=["Sovereign Dossier"])
app.include_router(aerosage.router, prefix="/aerosage", tags=["AeroSAGE Panel Method"])
app.include_router(vision.router, prefix="/vision", tags=["AeroVision Optical Engine"])
app.include_router(finite_wing.router, prefix="/finite-wing", tags=["Finite Wing & VLM"])

# ─── HEALTH CHECK WITH RATE LIMITING ──────────────────────────────────────

@app.get("/", tags=["Health"])
@limiter.limit("30/minute")
async def health_check(request: Request):
    return {
        "status": "Online",
        "version": "7.0.0",
        "engine": "AeroML Sovereign Core",
        "gpu_accelerated": str(ai_brain.device) != "cpu",
        "timestamp": time.time()
    }

@app.get("/health", tags=["Health"])
async def simple_health_check():
    return {
        "status": "healthy",
        "version": "7.0.0"
    }
