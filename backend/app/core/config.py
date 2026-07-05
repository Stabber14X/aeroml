import os

class Settings:
    # ─── DATABASE ──────────────────────────────────────────────────────────
    DB_USER: str = os.getenv("POSTGRES_USER", "postgres")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "aeroml_secure_pass")
    DB_HOST: str = os.getenv("POSTGRES_HOST", "127.0.0.1")
    DB_NAME: str = os.getenv("POSTGRES_DB", "aeroml_v6")
    
    SQLALCHEMY_DATABASE_URL = (
        f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
    )
    
    # ─── SECURITY ──────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here-change-this")
    
    # ─── CELERY / REDIS ────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")
    
    # ─── ADMIN EMAILS (Hardcoded for security) ────────────────────────────
    ADMIN_EMAILS = [
        "moddedgames200@gmail.com",
        "Abeeharaza22@gmail.com"
    ]
    
    # ─── EMAIL CONFIGURATION ──────────────────────────────────────────────
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "re_XRhZRUM2_646GuJqERePVTmV2GeaJLLBM")
    EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@aeroml.com")
    
    # ─── LEMON SQUEEZY PAYMENT CONFIGURATION ──────────────────────────────
    LEMON_SQUEEZY_API_KEY = os.getenv("LEMON_SQUEEZY_API_KEY", "")
    LEMON_SQUEEZY_STORE_ID = os.getenv("LEMON_SQUEEZY_STORE_ID", "")
    LEMON_SQUEEZY_WEBHOOK_SECRET = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
    LEMON_SQUEEZY_PRODUCT_ID = os.getenv("LEMON_SQUEEZY_PRODUCT_ID", "")
    LEMON_SQUEEZY_VARIANT_ID = os.getenv("LEMON_SQUEEZY_VARIANT_ID", "1873242")
    
    # ─── SUBSCRIPTION SETTINGS ────────────────────────────────────────────
    TRIAL_DURATION_HOURS = 24
    PREMIUM_DURATION_DAYS = 30
    PREMIUM_PRICE_MONTHLY = 19.00
    
    # ─── REDIS FOR RATE LIMITING ──────────────────────────────────────────
    REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")
    
    # ─── RATE LIMITING SETTINGS ────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE = 100
    RATE_LIMIT_SIGNUP_PER_HOUR = 5
    
    # ─── FRONTEND URL ──────────────────────────────────────────────────────
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

settings = Settings()