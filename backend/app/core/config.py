import os
from typing import Optional

class Settings:
    # ─── DATABASE CONFIGURATION ─────────────────────────────────────────────
    # Fetch the URL from Railway's environment
    raw_db_url = os.getenv("DATABASE_URL")
    
    if raw_db_url:
        # Railway provides 'postgresql://', but asyncpg requires 'postgresql+asyncpg://'
        if raw_db_url.startswith("postgresql://"):
            SQLALCHEMY_DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        else:
            SQLALCHEMY_DATABASE_URL = raw_db_url
        print(f"✅ Using DATABASE_URL from environment")
    else:
        # Fallback for your local development environment
        SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://postgres:aeroml_secure_pass@127.0.0.1/aeroml_v6"
        print(f"⚠️ Using local fallback DATABASE_URL")
    
    # Mask password for logs
    masked_url = SQLALCHEMY_DATABASE_URL
    if "@" in masked_url:
        parts = masked_url.split("@")
        if ":" in parts[0]:
            masked_url = parts[0].split(":")[0] + ":****@" + parts[1]
    
    print(f"📊 Database URL: {masked_url[:80]}...")
    
    # ─── REDIS CONFIGURATION ──────────────────────────────────────────────
    REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    
    # ─── SECURITY ────────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here-change-this")
    
    # ─── CELERY ──────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
    
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
    
    # ─── RATE LIMITING SETTINGS ───────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE = 100
    RATE_LIMIT_SIGNUP_PER_HOUR = 5

settings = Settings()