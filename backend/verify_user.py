import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select

async def verify_user():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == 'moddedgames200@gmail.com'))
        user = result.scalar_one_or_none()
        
        if user:
            print('=' * 50)
            print('✅ USER FOUND!')
            print('=' * 50)
            print(f'   Email: {user.email}')
            print(f'   is_admin: {user.is_admin}')
            print(f'   is_premium: {user.is_premium}')
            print(f'   is_active: {user.is_active}')
            print(f'   email_verified: {user.email_verified}')
            print('=' * 50)
        else:
            print('❌ USER NOT FOUND! Creating new one...')
            
            # Create new admin if not exists
            new_admin = User(
                email='moddedgames200@gmail.com',
                hashed_password=get_password_hash('admin123'),
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
            print('✅ New admin created!')
            print('   Email: moddedgames200@gmail.com')
            print('   Password: admin123')

asyncio.run(verify_user())
