import os
from typing import Optional

# ─── DATABASE CONFIGURATION ─────────────────────────────────────────────
# 1. Fetch the raw Database URL from Railway's environment
RAW_DB_URL = os.getenv("DATABASE_URL")

# 2. Format the URL to use the asyncpg driver
if RAW_DB_URL:
    if RAW_DB_URL.startswith("postgresql://"):
        SQLALCHEMY_DATABASE_URL = RAW_DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    else:
        SQLALCHEMY_DATABASE_URL = RAW_DB_URL
    print(f"✅ Using DATABASE_URL from environment")
else:
    # 3. Fallback for your local development environment
    SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://postgres:aeroml_secure_pass@127.0.0.1:5432/aeroml_v6"
    print(f"⚠️ Using LOCAL fallback DATABASE_URL")

# Print connection details for debugging (password masked)
masked_url = SQLALCHEMY_DATABASE_URL
if "@" in masked_url:
    parts = masked_url.split("@")
    if ":" in parts[0]:
        masked_url = parts[0].split(":")[0] + ":****@" + parts[1]

print(f"📊 Database URL: {masked_url[:80]}...")

# ─── REDIS CONFIGURATION ──────────────────────────────────────────────
# 4. Fetch the Redis URL from the environment, defaulting to localhost for local dev
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
print(f"📊 Redis URL: {REDIS_URL}")

# ─── OTHER STANDARD VARIABLES ─────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SECRET_KEY = os.getenv("SECRET_KEY", "your-fallback-secret-key-change-in-production")

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

# ─── CELERY ──────────────────────────────────────────────────────────────
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

# ─── CLASS FOR BACKWARD COMPATIBILITY ──────────────────────────────────
class Settings:
    def __init__(self):
        self.SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL
        self.REDIS_URL = REDIS_URL
        self.FRONTEND_URL = FRONTEND_URL
        self.SECRET_KEY = SECRET_KEY
        self.ADMIN_EMAILS = ADMIN_EMAILS
        self.RESEND_API_KEY = RESEND_API_KEY
        self.EMAIL_FROM = EMAIL_FROM
        self.DODO_SECRET_KEY = DODO_SECRET_KEY
        self.DODO_PUBLISHABLE_KEY = DODO_PUBLISHABLE_KEY
        self.DODO_WEBHOOK_SECRET = DODO_WEBHOOK_SECRET
        self.TRIAL_DURATION_HOURS = TRIAL_DURATION_HOURS
        self.PREMIUM_DURATION_DAYS = PREMIUM_DURATION_DAYS
        self.PREMIUM_PRICE_MONTHLY = PREMIUM_PRICE_MONTHLY
        self.RATE_LIMIT_PER_MINUTE = RATE_LIMIT_PER_MINUTE
        self.RATE_LIMIT_SIGNUP_PER_HOUR = RATE_LIMIT_SIGNUP_PER_HOUR
        self.CELERY_BROKER_URL = CELERY_BROKER_URL
        self.CELERY_RESULT_BACKEND = CELERY_RESULT_BACKEND

settings = Settings()