# backend/reset_abeeha_password.py
import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

# ─── NEW STRONG PASSWORD ──────────────────────────────────────────────────
NEW_PASSWORD = "alihaq14"

async def reset_password_abeeha():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == 'Abeeharaza22@gmail.com'))
        user = result.scalar_one_or_none()
        
        if user:
            user.hashed_password = get_password_hash(NEW_PASSWORD)
            user.force_password_change = True
            await db.commit()
            print('=' * 50)
            print('✅ ABEEHA PASSWORD RESET SUCCESSFUL!')
            print('=' * 50)
            print(f'   Email: {user.email}')
            print(f'   New Password: {NEW_PASSWORD}')
            print(f'   is_admin: {user.is_admin}')
            print(f'   is_premium: {user.is_premium}')
            print('=' * 50)
        else:
            print('❌ User not found!')

asyncio.run(reset_password_abeeha())