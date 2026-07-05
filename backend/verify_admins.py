import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select

async def verify_admins():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_admin == True))
        admins = result.scalars().all()
        
        print('=' * 50)
        print('✅ ADMIN ACCOUNTS')
        print('=' * 50)
        
        for admin in admins:
            print(f'Email: {admin.email}')
            print(f'  is_admin: {admin.is_admin}')
            print(f'  is_premium: {admin.is_premium}')
            print(f'  is_active: {admin.is_active}')
            print(f'  email_verified: {admin.email_verified}')
            print(f'  tier: {admin.tier}')
            print('')
        
        print('=' * 50)
        print(f'Total Admin Accounts: {len(admins)}')
        print('=' * 50)

asyncio.run(verify_admins())
