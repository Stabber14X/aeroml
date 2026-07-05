# backend/app/middleware/subscription.py
# COMPLETE FIXED IMPLEMENTATION - NO ERRORS

from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer
from jose import JWTError, jwt
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.core.config import settings
from app.core.security import SECRET_KEY, ALGORITHM
from app.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer()

# ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────

PUBLIC_ROUTES = [
    "/",
    "/auth/login",
    "/auth/signup",
    "/auth/verify-email",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/resend-verification",
    "/auth/db-test",
    "/openapi.json",
    "/docs",
    "/redoc",
    "/health",
]

# ─── ADMIN ROUTES ──────────────────────────────────────────────────────────

ADMIN_ROUTES = [
    "/admin",
    "/admin/stats",
    "/admin/users",
    "/admin/revenue/export",
    "/admin/users/",
]

# ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────

async def get_current_user_from_token(token: str, db: AsyncSession):
    """Extract user from JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            return None
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        return None
    
    try:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        return user
    except Exception as e:
        logger.error(f"Database error in get_current_user_from_token: {e}")
        return None

async def check_subscription_access(user: User) -> dict:
    """
    Check if user has valid subscription and return status
    This is the HEART of the subscription system
    """
    now = datetime.utcnow()
    
    # ── ADMIN CHECK ──────────────────────────────────────────────
    # Administrators ALWAYS have access - FOREVER FREE
    if user.is_admin:
        return {
            "has_access": True,
            "status": "admin",
            "reason": None,
            "type": "Administrator"
        }
    
    # ── ACCOUNT ACTIVE CHECK ────────────────────────────────────
    if not user.is_active:
        return {
            "has_access": False,
            "status": "disabled",
            "reason": "Account is disabled by administrator",
            "type": "Disabled"
        }
    
    # ── EMAIL VERIFICATION CHECK ──────────────────────────────
    if not user.email_verified:
        return {
            "has_access": False,
            "status": "unverified",
            "reason": "Email address not verified. Check your inbox.",
            "type": "Unverified"
        }
    
    # ── PREMIUM SUBSCRIPTION CHECK ─────────────────────────────
    if user.is_premium:
        if user.subscription_expires_at and user.subscription_expires_at > now:
            days_left = (user.subscription_expires_at - now).days
            hours_left = (user.subscription_expires_at - now).total_seconds() / 3600
            return {
                "has_access": True,
                "status": "premium",
                "reason": None,
                "type": "Premium",
                "days_left": days_left,
                "hours_left": hours_left,
                "expires_at": user.subscription_expires_at.isoformat()
            }
        else:
            return {
                "has_access": False,
                "status": "expired_premium",
                "reason": "Your Premium subscription has expired. Renew now to continue.",
                "type": "Premium (Expired)",
                "expires_at": user.subscription_expires_at.isoformat() if user.subscription_expires_at else None
            }
    
    # ── FREEMIUM TRIAL CHECK ──────────────────────────────────
    if user.trial_expires_at:
        if user.trial_expires_at > now:
            hours_left = (user.trial_expires_at - now).total_seconds() / 3600
            days_left = (user.trial_expires_at - now).days
            return {
                "has_access": True,
                "status": "freemium",
                "reason": None,
                "type": "Freemium (Trial)",
                "hours_left": hours_left,
                "days_left": days_left,
                "expires_at": user.trial_expires_at.isoformat()
            }
        else:
            return {
                "has_access": False,
                "status": "expired_trial",
                "reason": "Your 24-hour free trial has expired. Upgrade to Premium to continue.",
                "type": "Freemium (Expired)",
                "expires_at": user.trial_expires_at.isoformat() if user.trial_expires_at else None
            }
    
    # ── NO SUBSCRIPTION ──────────────────────────────────────
    return {
        "has_access": False,
        "status": "no_subscription",
        "reason": "No active subscription found. Please sign up for a plan.",
        "type": "None"
    }

async def get_subscription_status(user: User) -> dict:
    """Get detailed subscription status for frontend display"""
    now = datetime.utcnow()
    
    if user.is_admin:
        return {
            "status": "admin",
            "type": "Administrator",
            "expires_at": None,
            "days_left": None,
            "hours_left": None,
            "is_active": True,
            "is_verified": user.email_verified
        }
    
    if user.is_premium:
        if user.subscription_expires_at and user.subscription_expires_at > now:
            days_left = (user.subscription_expires_at - now).days
            hours_left = (user.subscription_expires_at - now).total_seconds() / 3600
            return {
                "status": "active",
                "type": "Premium",
                "expires_at": user.subscription_expires_at.isoformat(),
                "days_left": days_left,
                "hours_left": round(hours_left, 1),
                "is_active": True,
                "is_verified": user.email_verified
            }
        else:
            return {
                "status": "expired",
                "type": "Premium (Expired)",
                "expires_at": user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
                "days_left": 0,
                "hours_left": 0,
                "is_active": False,
                "is_verified": user.email_verified
            }
    
    # Freemium
    if user.trial_expires_at and user.trial_expires_at > now:
        hours_left = (user.trial_expires_at - now).total_seconds() / 3600
        days_left = (user.trial_expires_at - now).days
        return {
            "status": "active",
            "type": "Freemium (Trial)",
            "expires_at": user.trial_expires_at.isoformat(),
            "days_left": days_left,
            "hours_left": round(hours_left, 1),
            "is_active": True,
            "is_verified": user.email_verified
        }
    else:
        return {
            "status": "expired",
            "type": "Freemium (Expired)",
            "expires_at": user.trial_expires_at.isoformat() if user.trial_expires_at else None,
            "days_left": 0,
            "hours_left": 0,
            "is_active": False,
            "is_verified": user.email_verified
        }

# ─── THE MIDDLEWARE FUNCTION ──────────────────────────────────────────────
# THIS IS THE CORRECT IMPLEMENTATION - NOT A CLASS!

async def subscription_middleware(request: Request, call_next):
    """
    FASTAPI MIDDLEWARE - Checks subscription on every protected route
    THIS IS THE CORRECT WAY - FastAPI middleware must be an async function
    """
    
    # ── STEP 1: Skip public routes ──────────────────────────────
    if request.url.path in PUBLIC_ROUTES:
        return await call_next(request)
    
    # ── STEP 2: Skip static files ──────────────────────────────
    if request.url.path.startswith("/static"):
        return await call_next(request)
    
    if request.url.path.startswith("/_next"):
        return await call_next(request)
    
    # ── STEP 3: Handle OPTIONS preflight ──────────────────────
    if request.method == "OPTIONS":
        return await call_next(request)
    
    # ── STEP 4: Get Authorization header ──────────────────────
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        # Allow health checks without auth
        if request.url.path == "/" or request.url.path == "/health":
            return await call_next(request)
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # ── STEP 5: Extract token ──────────────────────────────────
    token = auth_header.replace("Bearer ", "")
    
    # ── STEP 6: Check if this is an admin route ──────────────
    is_admin_route = False
    for route in ADMIN_ROUTES:
        if request.url.path.startswith(route):
            is_admin_route = True
            break
    
    # ── STEP 7: Get user from database ──────────────────────────
    async with AsyncSessionLocal() as db:
        user = await get_current_user_from_token(token, db)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # ── STEP 8: Check subscription status ──────────────────
        subscription_status = await check_subscription_access(user)
        
        # ── STEP 9: Admin route check ──────────────────────────
        if is_admin_route:
            if not user.is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required for this route."
                )
            # Admin passes - add to request state
            request.state.user = user
            request.state.subscription = subscription_status
            return await call_next(request)
        
        # ── STEP 10: Subscription check ────────────────────────
        if not subscription_status["has_access"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=subscription_status["reason"],
                headers={
                    "X-Subscription-Status": subscription_status["status"],
                    "X-Subscription-Detail": subscription_status["reason"],
                    "X-Subscription-Type": subscription_status.get("type", "Unknown")
                }
            )
        
        # ── STEP 11: Success - add user to request state ──────
        request.state.user = user
        request.state.subscription = subscription_status
    
    # ── STEP 12: Continue to endpoint ──────────────────────────
    return await call_next(request)