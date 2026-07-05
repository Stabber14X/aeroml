import os

class Settings:
    # ─── DATABASE CONFIGURATION ─────────────────────────────────────────────
    # PRIORITY 1: Use Railway's DATABASE_URL (auto-provided)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # PRIORITY 2: Fallback for local development
    DB_USER: str = os.getenv("POSTGRES_USER", "postgres")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "aeroml_secure_pass")
    DB_HOST: str = os.getenv("POSTGRES_HOST", "127.0.0.1")
    DB_NAME: str = os.getenv("POSTGRES_DB", "aeroml_v6")
    
    # Build SQLAlchemy URL - Use DATABASE_URL if available (Railway)
    if DATABASE_URL:
        # Ensure asyncpg driver is used
        if DATABASE_URL.startswith("postgresql://"):
            SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        elif DATABASE_URL.startswith("postgresql+asyncpg://"):
            SQLALCHEMY_DATABASE_URL = DATABASE_URL
        else:
            SQLALCHEMY_DATABASE_URL = DATABASE_URL
    else:
        # Local development fallback
        SQLALCHEMY_DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
    
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

# ─── DEBUG: Print database connection info (remove in production) ──────
if __name__ == "__main__":
    print("=" * 60)
    print("🔍 DATABASE CONFIGURATION DEBUG")
    print("=" * 60)
    print(f"DATABASE_URL from env: {'✅ SET' if settings.DATABASE_URL else '❌ NOT SET'}")
    print(f"Using SQLALCHEMY_DATABASE_URL: {settings.SQLALCHEMY_DATABASE_URL[:50]}...")
    print("=" * 60)