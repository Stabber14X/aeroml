# backend/app/core/config.py
import os
from typing import Optional

class Settings:
    # ─── DATABASE CONFIGURATION ─────────────────────────────────────────────
    # Your actual Railway PostgreSQL credentials
    # Priority 1: Use the exact Railway environment variables
    POSTGRES_USER: str = os.getenv("PGUSER", os.getenv("POSTGRES_USER", "postgres"))
    POSTGRES_PASSWORD: str = os.getenv("PGPASSWORD", os.getenv("POSTGRES_PASSWORD", "UmSaWRPvblHcUSClWeXGTKqvTSPSIzeG"))
    POSTGRES_HOST: str = os.getenv("PGHOST", os.getenv("POSTGRES_HOST", "hayabusa.proxy.rlwy.net"))
    POSTGRES_PORT: str = os.getenv("PGPORT", os.getenv("POSTGRES_PORT", "37086"))
    POSTGRES_DB: str = os.getenv("PGDATABASE", os.getenv("POSTGRES_DB", "railway"))
    
    # Priority 2: Use DATABASE_URL if provided (Railway sometimes provides this)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # ─── BUILD DATABASE URL ──────────────────────────────────────────────────
    # First, try to use DATABASE_URL if it exists
    if DATABASE_URL:
        print(f"✅ Using DATABASE_URL from environment")
        if DATABASE_URL.startswith("postgresql://"):
            SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        elif DATABASE_URL.startswith("postgresql+asyncpg://"):
            SQLALCHEMY_DATABASE_URL = DATABASE_URL
        else:
            SQLALCHEMY_DATABASE_URL = DATABASE_URL
    else:
        # Build from individual Railway variables
        print(f"✅ Building DATABASE_URL from individual variables")
        SQLALCHEMY_DATABASE_URL = f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    
    # Print connection details for debugging (password masked)
    masked_url = SQLALCHEMY_DATABASE_URL
    if "@" in masked_url:
        parts = masked_url.split("@")
        if ":" in parts[0]:
            masked_url = parts[0].split(":")[0] + ":****@" + parts[1]
    
    print(f"📊 Database URL: {masked_url[:80]}...")
    print(f"📍 Host: {POSTGRES_HOST}:{POSTGRES_PORT}")
    print(f"📁 Database: {POSTGRES_DB}")
    print(f"👤 User: {POSTGRES_USER}")
    
    # ─── SECURITY ────────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here-change-this")
    
    # ─── CELERY ──────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")
    
    # ─── ADMIN EMAILS ───────────────────────────────────────────────────────
    ADMIN_EMAILS = [
        "moddedgames200@gmail.com",
        "Abeeharaza22@gmail.com"
    ]
    
    # ─── EMAIL CONFIGURATION ──────────────────────────────────────────────
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@aeroml.com")
    
    # ─── DODO PAYMENT CONFIGURATION ──────────────────────────────────────
    DODO_SECRET_KEY = os.getenv("DODO_SECRET_KEY", "")
    DODO_PUBLISHABLE_KEY = os.getenv("DODO_PUBLISHABLE_KEY", "")
    DODO_WEBHOOK_SECRET = os.getenv("DODO_WEBHOOK_SECRET", "")
    
    # ─── SUBSCRIPTION SETTINGS ────────────────────────────────────────────
    TRIAL_DURATION_HOURS = 24
    PREMIUM_DURATION_DAYS = 30
    PREMIUM_PRICE_MONTHLY = 19.00
    
    # ─── REDIS FOR RATE LIMITING ──────────────────────────────────────────
    REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")
    
    # ─── RATE LIMITING SETTINGS ───────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE = 100
    RATE_LIMIT_SIGNUP_PER_HOUR = 5

settings = Settings()