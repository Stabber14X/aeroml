# backend/app/middleware/rate_limit.py
from fastapi import Request, HTTPException, status
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import redis
import os

# Redis connection for rate limiting
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/1")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_available = True
except Exception as e:
    print(f"Redis not available, using in-memory rate limiting: {e}")
    redis_available = False

# Create limiter
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=REDIS_URL if redis_available else "memory://",
)

# Rate limit decorator
def rate_limit(limit: str):
    """Rate limit decorator with custom limit"""
    return limiter.limit(limit)

# Rate limit exception handler
def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Rate limit exceeded. Please wait before trying again.",
        headers={"Retry-After": str(exc.retry_after)}
    )

# Add to app in main.py
def setup_rate_limiting(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
    return app