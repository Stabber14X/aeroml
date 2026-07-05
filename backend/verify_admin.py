import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select

async def verify():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == 'moddedgames200@gmail.com'))
        user = result.scalar_one_or_none()
        
        if user:
            print('=' * 50)
            print('✅ ADMIN ACCOUNT VERIFIED')
            print('=' * 50)
            print(f'Email: {user.email}')
            print(f'is_admin: {user.is_admin}')
            print(f'is_premium: {user.is_premium}')
            print(f'is_active: {user.is_active}')
            print(f'email_verified: {user.email_verified}')
            print(f'force_password_change: {user.force_password_change}')
            print(f'tier: {user.tier}')
            print('=' * 50)
        else:
            print('❌ Admin account not found!')

asyncio.run(verify())
