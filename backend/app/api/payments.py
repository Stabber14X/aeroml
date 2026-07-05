# backend/app/api/payments.py
# COMPLETE LEMON SQUEEZY PAYMENT INTEGRATION - TEST MODE READY

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
import hmac
import hashlib
import json
import os
import httpx
import secrets

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.core.config import settings
from app.middleware.subscription import get_subscription_status

router = APIRouter(prefix="/payments", tags=["Payments"])

# ─── LEMON SQUEEZY CONFIG ──────────────────────────────────────────

LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1"
LEMON_SQUEEZY_API_KEY = settings.LEMON_SQUEEZY_API_KEY
LEMON_SQUEEZY_STORE_ID = settings.LEMON_SQUEEZY_STORE_ID
LEMON_SQUEEZY_WEBHOOK_SECRET = settings.LEMON_SQUEEZY_WEBHOOK_SECRET
LEMON_SQUEEZY_VARIANT_ID = settings.LEMON_SQUEEZY_VARIANT_ID
LEMON_SQUEEZY_PRODUCT_ID = settings.LEMON_SQUEEZY_PRODUCT_ID
FRONTEND_URL = settings.FRONTEND_URL

# ─── CHECKOUT SESSION ─────────────────────────────────────────────

@router.post("/create-checkout")
async def create_checkout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a Lemon Squeezy checkout session for subscription"""
    
    # Check if payment is configured
    if not LEMON_SQUEEZY_API_KEY:
        print("⚠️ LEMON_SQUEEZY_API_KEY not set.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment system not configured. Please try again later."
        )
    
    # Check if user already has premium
    now = datetime.utcnow()
    if user.is_premium and user.subscription_expires_at and user.subscription_expires_at > now:
        return {
            "status": "already_active",
            "message": "You already have an active premium subscription",
            "expires_at": user.subscription_expires_at.isoformat()
        }
    
    is_renewal = user.is_premium and user.subscription_expires_at and user.subscription_expires_at < now
    
    try:
        headers = {
            "Authorization": f"Bearer {LEMON_SQUEEZY_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Create checkout payload
        payload = {
            "data": {
                "type": "checkouts",
                "attributes": {
                    "store_id": LEMON_SQUEEZY_STORE_ID,
                    "variant_id": LEMON_SQUEEZY_VARIANT_ID,
                    "product_options": {
                        "name": "AeroML Premium Subscription",
                        "description": "Full access to all AeroML features for 30 days",
                        "redirect_url": f"{FRONTEND_URL}/dashboard?payment=success",
                        "receipt_button_url": f"{FRONTEND_URL}/dashboard",
                        "receipt_thank_you_note": "Thank you for subscribing to AeroML Premium! 🚀"
                    },
                    "checkout_data": {
                        "email": user.email,
                        "custom": {
                            "user_id": str(user.id),
                            "user_email": user.email,
                            "is_renewal": str(is_renewal)
                        }
                    }
                }
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{LEMON_SQUEEZY_API_URL}/checkouts",
                json=payload,
                headers=headers
            )
            
            if response.status_code != 200 and response.status_code != 201:
                print(f"Lemon Squeezy API Error: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Payment gateway error. Please try again later."
                )
            
            data = response.json()
            
            checkout_url = data["data"]["attributes"].get("url")
            checkout_id = data["data"]["id"]
            
            if not checkout_url:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create checkout session."
                )
            
            return {
                "status": "success",
                "checkout_url": checkout_url,
                "checkout_id": checkout_id,
                "is_renewal": is_renewal,
                "is_test_mode": True
            }
        
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Payment gateway timeout. Please try again."
        )
    except Exception as e:
        print(f"Payment error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment error: {str(e)}"
        )

# ─── WEBHOOK HANDLER ─────────────────────────────────────────────

async def verify_lemon_signature(payload: str, signature: str) -> bool:
    """Verify Lemon Squeezy webhook signature"""
    if not LEMON_SQUEEZY_WEBHOOK_SECRET:
        print("WARNING: LEMON_SQUEEZY_WEBHOOK_SECRET not set")
        return True
    
    try:
        expected = hmac.new(
            LEMON_SQUEEZY_WEBHOOK_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected, signature)
    except Exception as e:
        print(f"Signature verification error: {e}")
        return True

@router.post("/webhook/lemon")
async def lemon_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Lemon Squeezy payment webhook"""
    
    try:
        payload = await request.body()
        payload_str = payload.decode()
    except Exception as e:
        print(f"Failed to read payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    # Get signature (optional in test mode)
    signature = request.headers.get("x-signature", "")
    
    # Verify signature if we have a webhook secret
    if LEMON_SQUEEZY_WEBHOOK_SECRET:
        if not await verify_lemon_signature(payload_str, signature):
            print(f"Invalid signature. Got: {signature}")
            raise HTTPException(status_code=401, detail="Invalid signature")
    
    try:
        data = json.loads(payload_str)
        print(f"[LEMON SQUEEZY WEBHOOK] Received: {data}")
        
        event_name = data.get("meta", {}).get("event_name", "")
        print(f"[LEMON SQUEEZY WEBHOOK] Event: {event_name}")
        
        # Handle order_created event
        if event_name == "order_created":
            order_data = data.get("data", {}).get("attributes", {})
            
            # Extract user from custom data
            custom = order_data.get("custom", {})
            user_email = custom.get("user_email")
            user_id_str = custom.get("user_id")
            is_renewal = custom.get("is_renewal", "False") == "True"
            
            print(f"Processing order for: {user_email}, user_id: {user_id_str}")
            
            if not user_email:
                print("No user_email in custom data")
                return {"status": "ignored", "reason": "no user email"}
            
            # Find user
            from sqlalchemy import select
            result = await db.execute(select(User).where(User.email == user_email))
            user = result.scalar_one_or_none()
            
            if not user:
                print(f"User not found: {user_email}")
                return {"status": "ignored", "reason": "user not found"}
            
            # Update user to premium
            now = datetime.utcnow()
            
            if user.is_premium and user.subscription_expires_at and user.subscription_expires_at > now:
                # Extend from current expiry
                user.subscription_expires_at = user.subscription_expires_at + timedelta(days=settings.PREMIUM_DURATION_DAYS)
                print(f"Extended premium for {user_email} from {user.subscription_expires_at}")
            else:
                # New premium or expired
                user.is_premium = True
                user.subscription_started_at = now
                user.subscription_expires_at = now + timedelta(days=settings.PREMIUM_DURATION_DAYS)
                print(f"New premium for {user_email} until {user.subscription_expires_at}")
            
            # Store order reference
            user.dodo_customer_id = f"lemon_{order_data.get('customer_id', '')}"
            user.dodo_subscription_id = order_data.get("order_id", "")
            
            # Remove trial fields
            user.trial_started_at = None
            user.trial_expires_at = None
            
            await db.commit()
            
            print(f"✅ User {user_email} upgraded to premium until {user.subscription_expires_at}")
            
            return {"status": "success", "user": user_email}
        
        return {"status": "ignored", "event": event_name}
        
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    except Exception as e:
        print(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── SUBSCRIPTION STATUS ─────────────────────────────────────────

@router.get("/status")
async def get_payment_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current subscription status with payment info"""
    status = await get_subscription_status(user)
    
    return {
        "subscription": status,
        "payment_info": {
            "has_customer_id": bool(user.dodo_customer_id),
            "has_subscription_id": bool(user.dodo_subscription_id),
            "is_premium": user.is_premium
        }
    }

# ─── MANUAL UPGRADE (Admin Only) ─────────────────────────────────

@router.post("/admin/upgrade-user")
async def admin_upgrade_user(
    user_id: int,
    duration_days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Manually upgrade a user to premium"""
    
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    user.is_premium = True
    user.subscription_started_at = now
    user.subscription_expires_at = now + timedelta(days=duration_days)
    
    await db.commit()
    
    return {
        "status": "success",
        "user": user.email,
        "expires_at": user.subscription_expires_at.isoformat()
    }

# ─── TEST MODE WEBHOOK (for manual testing) ──────────────────────

@router.post("/test-upgrade")
async def test_upgrade(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """TEST MODE ONLY: Manually upgrade a user by email"""
    from sqlalchemy import select
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.utcnow()
    user.is_premium = True
    user.subscription_started_at = now
    user.subscription_expires_at = now + timedelta(days=settings.PREMIUM_DURATION_DAYS)
    
    await db.commit()
    
    return {
        "status": "success",
        "user": user.email,
        "expires_at": user.subscription_expires_at.isoformat()
    }