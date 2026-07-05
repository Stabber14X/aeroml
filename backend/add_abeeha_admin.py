# backend/add_abeeha_admin.py
import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select
from datetime import datetime

# ─── NEW STRONG PASSWORD ──────────────────────────────────────────────────
ADMIN_PASSWORD = "alihaq14"

async def add_abeeha_admin():
    async with AsyncSessionLocal() as db:
        # Check if Abeeha already exists
        result = await db.execute(select(User).where(User.email == 'Abeeharaza22@gmail.com'))
        user = result.scalar_one_or_none()
        
        if user:
            # If exists, upgrade to admin
            if not user.is_admin:
                user.is_admin = True
                user.is_premium = True
                user.is_active = True
                user.email_verified = True
                user.tier = 'admin'
                user.subscription_expires_at = None
                user.force_password_change = True
                # Update password to the new strong one
                user.hashed_password = get_password_hash(ADMIN_PASSWORD)
                await db.commit()
                print('=' * 50)
                print('✅ ABEEHA UPGRADED TO ADMIN!')
                print('=' * 50)
                print(f'   Email: {user.email}')
                print(f'   is_admin: {user.is_admin}')
                print(f'   is_premium: {user.is_premium}')
                print(f'   Password: {ADMIN_PASSWORD}')
                print('=' * 50)
            else:
                print('✅ Abeeha is already an admin!')
                print(f'   Email: {user.email}')
                print(f'   is_admin: {user.is_admin}')
            return
        
        # Create new admin account for Abeeha
        new_admin = User(
            email='Abeeharaza22@gmail.com',
            hashed_password=get_password_hash(ADMIN_PASSWORD),
            is_admin=True,
            is_premium=True,
            is_active=True,
            email_verified=True,
            tier='admin',
            subscription_expires_at=None,
            force_password_change=True,
            created_at=datetime.utcnow()
        )
        
        db.add(new_admin)
        await db.commit()
        
        print('=' * 50)
        print('✅ ABEEHA ADMIN ACCOUNT CREATED!')
        print('=' * 50)
        print(f'   Email: Abeeharaza22@gmail.com')
        print(f'   Password: {ADMIN_PASSWORD}')
        print(f'   is_admin: True')
        print(f'   is_premium: True')
        print('=' * 50)
        print('⚠️  FORCE PASSWORD CHANGE ENABLED')
        print('   Abeeha must change password on first login')
        print('=' * 50)

asyncio.run(add_abeeha_admin())