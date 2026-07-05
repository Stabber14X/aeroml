# backend/app/utils/admin_init.py
# COMPLETE ADMIN INITIALIZATION - NOTHING SKIPPED

from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from datetime import datetime, timedelta
from sqlalchemy import select, text
import os
import secrets
import logging

logger = logging.getLogger(__name__)

# ─── ADMIN EMAILS (HARDCODED FOR SECURITY) ──────────────────────────────

ADMIN_EMAILS = [
    "moddedgames200@gmail.com",
    "Abeeharaza22@gmail.com"
]

# ─── ADMIN PASSWORD ──────────────────────────────────────────────────────
# CHANGED FROM admin123 TO alihaq14 FOR BETTER SECURITY
ADMIN_PASSWORD = "alihaq14"

# ─── INITIALIZE ADMIN ACCOUNTS ────────────────────────────────────────────

async def init_admin_accounts():
    """
    Initialize admin accounts on first startup.
    This runs automatically when the application starts.
    Creates admin accounts if they don't exist.
    Upgrades existing accounts to admin if needed.
    """
    
    # Get admin password from environment or use the hardcoded one
    admin_password = os.getenv("ADMIN_PASSWORD")
    
    if not admin_password:
        # Use the strong hardcoded password
        admin_password = ADMIN_PASSWORD
        print("\n" + "=" * 70)
        print("🔐 ADMIN PASSWORD CONFIGURED")
        print("=" * 70)
        print(f"  ADMIN PASSWORD: {admin_password}")
        print("=" * 70)
        print("  To change this password, set ADMIN_PASSWORD environment variable")
        print("  Or update ADMIN_PASSWORD in app/utils/admin_init.py")
        print("=" * 70 + "\n")
    
    async with AsyncSessionLocal() as db:
        for email in ADMIN_EMAILS:
            # Check if user already exists
            result = await db.execute(select(User).where(User.email == email))
            existing = result.scalar_one_or_none()
            
            if existing:
                # If exists but isn't admin, upgrade
                if not existing.is_admin:
                    existing.is_admin = True
                    existing.is_premium = True
                    existing.email_verified = True
                    existing.subscription_expires_at = None  # Never expires
                    existing.is_active = True
                    existing.tier = "admin"
                    existing.force_password_change = True
                    
                    await db.commit()
                    logger.info(f"✅ Upgraded existing account to admin: {email}")
                    print(f"✅ Upgraded existing account to admin: {email}")
                else:
                    logger.info(f"✅ Admin account already exists: {email}")
                    print(f"✅ Admin account already exists: {email}")
                continue
            
            # Create new admin account with the strong password
            new_admin = User(
                email=email,
                hashed_password=get_password_hash(admin_password),
                is_admin=True,
                is_premium=True,
                is_active=True,
                email_verified=True,
                subscription_expires_at=None,  # Never expires
                subscription_started_at=datetime.utcnow(),
                tier="admin",
                force_password_change=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(new_admin)
            logger.info(f"✅ Created admin account: {email}")
            print(f"✅ Created admin account: {email}")
        
        await db.commit()
        
        print("\n" + "=" * 70)
        print("🔐 ADMIN ACCOUNTS CONFIGURED")
        print("=" * 70)
        for email in ADMIN_EMAILS:
            print(f"   📧 Email: {email}")
        print(f"   🔑 Password: {admin_password}")
        print("=" * 70)
        print("⚠️  PLEASE CHANGE THESE PASSWORDS AFTER FIRST LOGIN!")
        print("   Use the 'force_password_change' feature when logging in")
        print("=" * 70 + "\n")

# ─── VALIDATE ADMIN ACCOUNTS ──────────────────────────────────────────────

async def validate_admin_accounts():
    """
    Validate that admin accounts exist and are properly configured.
    This runs on startup to ensure admin access is available.
    """
    
    async with AsyncSessionLocal() as db:
        for email in ADMIN_EMAILS:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            
            if not user:
                logger.warning(f"⚠️ Admin account not found: {email}")
                print(f"⚠️ Admin account not found: {email}")
                continue
            
            # Ensure admin flags are correct
            if not user.is_admin or not user.is_premium:
                user.is_admin = True
                user.is_premium = True
                user.email_verified = True
                user.is_active = True
                user.tier = "admin"
                await db.commit()
                logger.info(f"✅ Fixed admin flags for: {email}")
                print(f"✅ Fixed admin flags for: {email}")
            
            # Ensure subscription never expires
            if user.subscription_expires_at is not None:
                user.subscription_expires_at = None
                await db.commit()
                logger.info(f"✅ Removed expiry for admin: {email}")
                print(f"✅ Removed expiry for admin: {email}")
            
            logger.info(f"✅ Admin account validated: {email}")
            print(f"✅ Admin account validated: {email}")

# ─── MANUAL ADMIN CREATION (FOR DEBUGGING) ──────────────────────────────

async def create_admin_manually(email: str, password: str):
    """
    Manually create an admin account.
    Use this for debugging or adding additional admins.
    """
    
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()
        
        if existing:
            if existing.is_admin:
                print(f"✅ User {email} is already an admin")
                return
            else:
                # Upgrade to admin
                existing.is_admin = True
                existing.is_premium = True
                existing.email_verified = True
                existing.is_active = True
                existing.tier = "admin"
                existing.subscription_expires_at = None
                await db.commit()
                print(f"✅ Upgraded {email} to admin")
                return
        
        # Create new admin
        new_admin = User(
            email=email,
            hashed_password=get_password_hash(password),
            is_admin=True,
            is_premium=True,
            is_active=True,
            email_verified=True,
            subscription_expires_at=None,
            tier="admin",
            created_at=datetime.utcnow()
        )
        
        db.add(new_admin)
        await db.commit()
        print(f"✅ Created admin: {email}")