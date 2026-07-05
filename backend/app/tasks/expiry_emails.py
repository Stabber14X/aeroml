# backend/app/tasks/expiry_emails.py
from app.celery_app import celery_app
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select
from datetime import datetime, timedelta
from app.utils.email import send_trial_expiry_warning, send_subscription_expiry_warning
import asyncio

@celery_app.task(name="check_expiring_trials", bind=True)
def check_expiring_trials(self):
    """Check for trials expiring in 24 hours and send warnings"""
    
    async def _check():
        now = datetime.utcnow()
        warning_time = now + timedelta(hours=24)
        
        async with AsyncSessionLocal() as db:
            # Find users with trials expiring in ~24 hours
            result = await db.execute(
                select(User).where(
                    User.trial_expires_at <= warning_time,
                    User.trial_expires_at > now,
                    User.is_premium == False,
                    User.is_admin == False,
                    User.email_verified == True,
                    User.is_active == True
                )
            )
            users = result.scalars().all()
            
            for user in users:
                hours_left = (user.trial_expires_at - now).total_seconds() / 3600
                try:
                    await send_trial_expiry_warning(
                        user.email,
                        user.email.split('@')[0],
                        int(hours_left)
                    )
                    print(f"✅ Sent trial expiry warning to {user.email}")
                except Exception as e:
                    print(f"❌ Failed to send trial expiry warning to {user.email}: {e}")
            
            return {"sent": len(users)}
    
    return asyncio.run(_check())

@celery_app.task(name="check_expiring_subscriptions", bind=True)
def check_expiring_subscriptions(self):
    """Check for subscriptions expiring in 2 days and send warnings"""
    
    async def _check():
        now = datetime.utcnow()
        warning_time = now + timedelta(days=2)
        
        async with AsyncSessionLocal() as db:
            # Find users with subscriptions expiring in ~2 days
            result = await db.execute(
                select(User).where(
                    User.subscription_expires_at <= warning_time,
                    User.subscription_expires_at > now,
                    User.is_premium == True,
                    User.is_admin == False,
                    User.email_verified == True,
                    User.is_active == True
                )
            )
            users = result.scalars().all()
            
            for user in users:
                days_left = (user.subscription_expires_at - now).days
                try:
                    await send_subscription_expiry_warning(
                        user.email,
                        user.email.split('@')[0],
                        days_left
                    )
                    print(f"✅ Sent subscription expiry warning to {user.email}")
                except Exception as e:
                    print(f"❌ Failed to send subscription expiry warning to {user.email}: {e}")
            
            return {"sent": len(users)}
    
    return asyncio.run(_check())

@celery_app.task(name="check_expired_subscriptions", bind=True)
def check_expired_subscriptions(self):
    """Check for subscriptions that just expired and freeze access"""
    
    async def _check():
        now = datetime.utcnow()
        
        async with AsyncSessionLocal() as db:
            # Find users whose premium just expired (in the last hour)
            result = await db.execute(
                select(User).where(
                    User.is_premium == True,
                    User.subscription_expires_at <= now,
                    User.subscription_expires_at > now - timedelta(hours=1),
                    User.is_admin == False
                )
            )
            users = result.scalars().all()
            
            # Log expired subscriptions
            for user in users:
                print(f"⏰ Premium expired for: {user.email} at {user.subscription_expires_at}")
                # In production, you might want to send a final expiry email here
            
            return {"expired": len(users)}
    
    return asyncio.run(_check())