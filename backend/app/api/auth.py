# backend/app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Union, Optional
import secrets
import hashlib

from app.database import get_db
from app.models.user import User
from app.core.security import verify_password, create_access_token, get_password_hash, SECRET_KEY, ALGORITHM
from app.core.config import settings
from app.utils.email import (
    send_verification_email, 
    send_reset_password_email,
    send_trial_expiry_warning,
    send_subscription_expiry_warning
)
from app.middleware.subscription import check_subscription_access, get_subscription_status
from app.middleware.rate_limit import limiter

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# ─── PYDANTIC MODELS ─────────────────────────────────────────────

class UserAuth(BaseModel):
    email: EmailStr
    password: str

class UserSignup(BaseModel):
    email: EmailStr
    password: str
    plan: str  # "freemium" or "premium"

class VerifyEmailRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class SubscriptionStatusResponse(BaseModel):
    status: str
    type: str
    expires_at: Optional[str] = None
    days_left: Optional[int] = None
    hours_left: Optional[float] = None
    is_active: bool
    is_verified: bool
    is_admin: bool = False
    tier: str = "free"

class UpgradeRequest(BaseModel):
    user_id: int
    duration_days: int = 30

# ─── AUTH HELPERS ─────────────────────────────────────────────────

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """Verifies JWT token and retrieves user from the database."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()

    if user is None:
        raise credentials_exception
    return user

def generate_verification_token():
    """Generate a secure verification token"""
    return secrets.token_urlsafe(32)

def generate_reset_token():
    """Generate a secure password reset token"""
    return secrets.token_urlsafe(32)

# ─── AUTH ENDPOINTS ──────────────────────────────────────────────

@router.get("/db-test")
async def test_db_connection(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1")) 
        return {"status": "Database Connected Successfully", "source": "Auth Router"}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database connection failed: {e}")

@router.post("/signup")
@limiter.limit("5/hour")
async def signup(request: Request, user_dat: UserSignup, db: AsyncSession = Depends(get_db)):
    """Signup with freemium or premium plan"""
    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_dat.email))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    
    # Create user
    now = datetime.utcnow()
    verification_token = generate_verification_token()
    
    new_user = User(
        email=user_dat.email,
        hashed_password=get_password_hash(user_dat.password),
        email_verified=False,
        is_active=True,
        is_admin=False,
        is_premium=False,
        verification_token=verification_token,
        verification_token_expires_at=now + timedelta(hours=24),
        created_at=now
    )
    
    # Set trial or subscription based on plan
    if user_dat.plan == "freemium":
        new_user.trial_started_at = now
        new_user.trial_expires_at = now + timedelta(hours=settings.TRIAL_DURATION_HOURS)
    elif user_dat.plan == "premium":
        # Premium users still need to pay - they'll be upgraded after payment
        new_user.is_premium = False
        # They'll get premium after payment
    else:
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'freemium' or 'premium'")
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Send verification email
    try:
        await send_verification_email(user_dat.email, verification_token, user_dat.email.split('@')[0])
    except Exception as e:
        print(f"Email send failed: {e}")
        # Continue anyway - user can request resend
    
    return {
        "message": "User created successfully",
        "plan": user_dat.plan,
        "email_verification_sent": True,
        "user_id": new_user.id
    }

@router.post("/verify-email")
async def verify_email(request: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Verify user's email with token"""
    result = await db.execute(
        select(User).where(User.verification_token == request.token)
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    if user.verification_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification token expired")
    
    # Set email_verified to True
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    
    await db.commit()
    
    return {"message": "Email verified successfully"}

@router.post("/resend-verification")
@limiter.limit("3/hour")
async def resend_verification(request: Request, email: str, db: AsyncSession = Depends(get_db)):
    """Resend verification email"""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.email_verified:
        raise HTTPException(status_code=400, detail="Email already verified")
    
    # Generate new token
    verification_token = generate_verification_token()
    user.verification_token = verification_token
    user.verification_token_expires_at = datetime.utcnow() + timedelta(hours=24)
    
    await db.commit()
    
    # Send email
    try:
        await send_verification_email(email, verification_token, email.split('@')[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send verification email")
    
    return {"message": "Verification email sent"}

@router.post("/login")
@limiter.limit("30/minute")
async def login(request: Request, user_dat: UserAuth, db: AsyncSession = Depends(get_db)):
    """Login user with subscription check"""
    result = await db.execute(select(User).where(User.email == user_dat.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    if not verify_password(user_dat.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    # CRITICAL: Email verification check (skip for admin)
    if not user.email_verified and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email before logging in. Check your inbox for the verification link.",
                "action": "resend_verification",
                "email": user.email
            }
        )
    
    # Check if account is active
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    # Check subscription access
    has_access = await check_subscription_access(user)
    
    # Generate token
    access_token = create_access_token(data={"sub": user.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "has_access": has_access["has_access"],
        "is_admin": user.is_admin,
        "is_premium": user.is_premium
    }

@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(request: Request, forgot_data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send password reset email"""
    result = await db.execute(select(User).where(User.email == forgot_data.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate reset token
    reset_token = generate_reset_token()
    user.reset_token = reset_token
    user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    await db.commit()
    
    # Send email
    try:
        await send_reset_password_email(forgot_data.email, reset_token, forgot_data.email.split('@')[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send reset email")
    
    return {"message": "Password reset email sent"}

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password with token"""
    result = await db.execute(
        select(User).where(User.reset_token == request.token)
    )
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    
    if user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset token expired")
    
    # Update password
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    
    await db.commit()
    
    return {"message": "Password reset successfully"}

@router.get("/me", response_model=SubscriptionStatusResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current user's subscription status"""
    status = await get_subscription_status(current_user)
    status["is_admin"] = current_user.is_admin
    status["tier"] = current_user.tier
    return status

@router.post("/upgrade")
async def upgrade_to_premium(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upgrade freemium user to premium (manual/admin use)"""
    # Only admin can manually upgrade
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # This is a manual upgrade - payment will be handled separately
    # In production, this would be triggered by the payment webhook
    
    return {"message": "Upgrade endpoint - use payment webhook for automatic upgrade"}

@router.post("/check-subscription")
async def check_subscription(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Check if user has valid subscription"""
    has_access = await check_subscription_access(current_user)
    status = await get_subscription_status(current_user)
    
    return {
        "has_access": has_access["has_access"],
        "subscription": status
    }

@router.post("/admin/grant-premium")
async def grant_premium(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Grant premium access to a user"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    user.is_premium = True
    user.subscription_started_at = now
    user.subscription_expires_at = now + timedelta(days=settings.PREMIUM_DURATION_DAYS)
    
    await db.commit()
    
    return {
        "message": f"Premium access granted to {user.email}",
        "expires_at": user.subscription_expires_at.isoformat()
    }

@router.post("/admin/extend-trial")
async def extend_trial(
    user_id: int,
    hours: int = 24,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Extend trial for a user"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.trial_expires_at = datetime.utcnow() + timedelta(hours=hours)
    
    await db.commit()
    
    return {
        "message": f"Trial extended by {hours} hours",
        "new_expiry": user.trial_expires_at.isoformat()
    }