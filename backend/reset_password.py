# backend/reset_password.py
import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

# ─── NEW STRONG PASSWORD ──────────────────────────────────────────────────
NEW_PASSWORD = "alihaq14"

async def reset_password():
    async with AsyncSessionLocal() as db:
        # Reset for both admin emails
        admin_emails = ["moddedgames200@gmail.com", "Abeeharaza22@gmail.com"]
        
        for email in admin_emails:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            
            if user:
                user.hashed_password = get_password_hash(NEW_PASSWORD)
                user.force_password_change = True
                print('=' * 50)
                print(f'✅ PASSWORD RESET SUCCESSFUL FOR {email}!')
                print('=' * 50)
                print(f'   Email: {user.email}')
                print(f'   New Password: {NEW_PASSWORD}')
                print(f'   is_admin: {user.is_admin}')
                print(f'   is_premium: {user.is_premium}')
                print('=' * 50)
            else:
                print(f'❌ User not found: {email}')
        
        await db.commit()

asyncio.run(reset_password())