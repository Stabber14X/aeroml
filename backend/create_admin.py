# backend/create_admin.py
import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select
from datetime import datetime

# ─── NEW STRONG PASSWORD ──────────────────────────────────────────────────
ADMIN_PASSWORD = "alihaq14"

async def create_admin():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == 'moddedgames200@gmail.com'))
        admin = result.scalar_one_or_none()
        
        if admin:
            print('✅ Admin already exists!')
            print(f'   Email: {admin.email}')
            print(f'   is_admin: {admin.is_admin}')
            print(f'   is_premium: {admin.is_premium}')
            return
        
        new_admin = User(
            email='moddedgames200@gmail.com',
            hashed_password=get_password_hash(ADMIN_PASSWORD),
            is_admin=True,
            is_premium=True,
            is_active=True,
            email_verified=True,
            tier='admin',
            subscription_expires_at=None,
            force_password_change=False,
            created_at=datetime.utcnow()
        )
        
        db.add(new_admin)
        await db.commit()
        
        print('=' * 50)
        print('✅ ADMIN ACCOUNT CREATED!')
        print('=' * 50)
        print(f'   Email: moddedgames200@gmail.com')
        print(f'   Password: {ADMIN_PASSWORD}')
        print(f'   is_admin: True')
        print(f'   is_premium: True')
        print('=' * 50)

asyncio.run(create_admin())