# backend/app/api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.middleware.subscription import get_subscription_status
from app.core.config import settings

router = APIRouter()

# ─── PYDANTIC MODELS ─────────────────────────────────────────────

class UserAdminResponse(BaseModel):
    id: int
    email: str
    is_admin: bool
    is_premium: bool
    is_active: bool
    email_verified: bool
    created_at: str
    trial_expires_at: Optional[str] = None
    subscription_expires_at: Optional[str] = None
    subscription_status: str
    subscription_type: str
    days_left: Optional[int] = None

class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    premium_users: int
    trial_users: int
    expired_users: int
    admin_users: int
    conversion_rate: float
    monthly_recurring_revenue: float
    total_revenue: float
    signups_last_7_days: int
    signups_last_30_days: int

class AdminActionResponse(BaseModel):
    message: str
    user_id: int
    action: str

# ─── ADMIN HELPER ─────────────────────────────────────────────────

async def check_admin_access(user: User) -> bool:
    """Check if user has admin access"""
    if not user.is_admin:
        return False
    if not user.is_active:
        return False
    if not user.email_verified:
        return False
    return True

# ─── ADMIN ENDPOINTS ─────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get admin dashboard statistics"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.utcnow()
    
    # Get all users
    result = await db.execute(select(User))
    all_users = result.scalars().all()
    
    total_users = len(all_users)
    admin_users = sum(1 for u in all_users if u.is_admin)
    premium_users = sum(1 for u in all_users if u.is_premium and u.subscription_expires_at and u.subscription_expires_at > now)
    trial_users = sum(1 for u in all_users if not u.is_premium and not u.is_admin and u.trial_expires_at and u.trial_expires_at > now)
    expired_users = sum(1 for u in all_users if not u.is_admin and not u.is_premium and u.trial_expires_at and u.trial_expires_at < now)
    active_users = sum(1 for u in all_users if u.is_active)
    
    # Signups last 7 days
    seven_days_ago = now - timedelta(days=7)
    result = await db.execute(
        select(User).where(User.created_at >= seven_days_ago)
    )
    signups_7d = len(result.scalars().all())
    
    # Signups last 30 days
    thirty_days_ago = now - timedelta(days=30)
    result = await db.execute(
        select(User).where(User.created_at >= thirty_days_ago)
    )
    signups_30d = len(result.scalars().all())
    
    # Conversion rate (premium users / total users)
    conversion_rate = (premium_users / total_users) * 100 if total_users > 0 else 0
    
    # Revenue (assuming $19/month per premium user)
    monthly_recurring_revenue = premium_users * 19.00
    total_revenue = premium_users * 19.00
    
    return AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        premium_users=premium_users,
        trial_users=trial_users,
        expired_users=expired_users,
        admin_users=admin_users,
        conversion_rate=round(conversion_rate, 1),
        monthly_recurring_revenue=round(monthly_recurring_revenue, 2),
        total_revenue=round(total_revenue, 2),
        signups_last_7_days=signups_7d,
        signups_last_30_days=signups_30d
    )

@router.get("/users", response_model=List[UserAdminResponse])
async def get_all_users(
    status: Optional[str] = Query(None, description="Filter by status: all, active, expired, premium, trial"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all users with their subscription status"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.utcnow()
    
    # Build query
    query = select(User)
    
    # Apply filters
    if status:
        if status == "active":
            query = query.where(User.is_active == True)
        elif status == "expired":
            query = query.where(
                (User.is_premium == False) & 
                (User.trial_expires_at < now) &
                (User.is_admin == False)
            )
        elif status == "premium":
            query = query.where(
                (User.is_premium == True) & 
                (User.subscription_expires_at > now)
            )
        elif status == "trial":
            query = query.where(
                (User.is_premium == False) & 
                (User.trial_expires_at > now) &
                (User.is_admin == False)
            )
    
    # Order by created_at descending
    query = query.order_by(User.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    response = []
    for user in users:
        status_info = await get_subscription_status(user)
        response.append(
            UserAdminResponse(
                id=user.id,
                email=user.email,
                is_admin=user.is_admin,
                is_premium=user.is_premium,
                is_active=user.is_active,
                email_verified=user.email_verified,
                created_at=user.created_at.isoformat() if user.created_at else "",
                trial_expires_at=user.trial_expires_at.isoformat() if user.trial_expires_at else None,
                subscription_expires_at=user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
                subscription_status=status_info["status"],
                subscription_type=status_info["type"],
                days_left=status_info.get("days_left")
            )
        )
    
    return response

@router.get("/users/{user_id}", response_model=UserAdminResponse)
async def get_user_details(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get specific user details"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    status_info = await get_subscription_status(user)
    
    return UserAdminResponse(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_premium=user.is_premium,
        is_active=user.is_active,
        email_verified=user.email_verified,
        created_at=user.created_at.isoformat() if user.created_at else "",
        trial_expires_at=user.trial_expires_at.isoformat() if user.trial_expires_at else None,
        subscription_expires_at=user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
        subscription_status=status_info["status"],
        subscription_type=status_info["type"],
        days_left=status_info.get("days_left")
    )

@router.post("/users/{user_id}/toggle-active", response_model=AdminActionResponse)
async def toggle_user_active(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Toggle user active status (disable/enable)"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # PREVENT disabling admin accounts
    if user.is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Cannot disable admin accounts. Admin accounts cannot be deactivated."
        )
    
    user.is_active = not user.is_active
    await db.commit()
    
    action = "activated" if user.is_active else "disabled"
    return AdminActionResponse(
        message=f"User {user.email} {action} successfully",
        user_id=user.id,
        action="toggle_active"
    )

@router.post("/users/{user_id}/grant-premium", response_model=AdminActionResponse)
async def admin_grant_premium(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Grant premium access to a user"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # PREVENT granting premium to admin accounts (they already have full access)
    if user.is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Admin accounts already have full access. No need to grant premium."
        )
    
    now = datetime.utcnow()
    user.is_premium = True
    user.subscription_started_at = now
    user.subscription_expires_at = now + timedelta(days=settings.PREMIUM_DURATION_DAYS)
    
    await db.commit()
    
    return AdminActionResponse(
        message=f"Premium access granted to {user.email} for 30 days",
        user_id=user.id,
        action="grant_premium"
    )

@router.post("/users/{user_id}/extend-trial", response_model=AdminActionResponse)
async def admin_extend_trial(
    user_id: int,
    hours: int = Query(24, ge=1, le=168),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Extend trial for a user"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # PREVENT extending trial for admin accounts
    if user.is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Admin accounts do not have trials. They have unlimited access."
        )
    
    user.trial_expires_at = datetime.utcnow() + timedelta(hours=hours)
    await db.commit()
    
    return AdminActionResponse(
        message=f"Trial extended for {user.email} by {hours} hours",
        user_id=user.id,
        action="extend_trial"
    )

@router.delete("/users/{user_id}", response_model=AdminActionResponse)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a user (admin only)"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # PREVENT deleting admin accounts
    if user.is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete admin accounts. Admin accounts cannot be removed."
        )
    
    await db.delete(user)
    await db.commit()
    
    return AdminActionResponse(
        message=f"User {user.email} deleted successfully",
        user_id=user.id,
        action="delete"
    )

@router.get("/revenue/export")
async def export_revenue_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export revenue data as CSV (admin only)"""
    if not await check_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all premium users
    result = await db.execute(select(User).where(User.is_premium == True))
    premium_users = result.scalars().all()
    
    # Generate CSV
    import csv
    from io import StringIO
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Email", "Subscription Started", "Subscription Expires", "Days Left"])
    
    now = datetime.utcnow()
    for user in premium_users:
        days_left = (user.subscription_expires_at - now).days if user.subscription_expires_at else 0
        writer.writerow([
            user.email,
            user.subscription_started_at.isoformat() if user.subscription_started_at else "",
            user.subscription_expires_at.isoformat() if user.subscription_expires_at else "",
            days_left
        ])
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=revenue_data.csv"}
    )