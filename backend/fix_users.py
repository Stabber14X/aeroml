import asyncio
from app.database import engine, Base
from app.models.user import User
from sqlalchemy import text

async def fix():
    async with engine.begin() as conn:
        # 1. Destroy the broken table
        await conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
        # 2. Rebuild it using our flawless SQLAlchemy model
        await conn.run_sync(Base.metadata.create_all)
    print("SUCCESS: Users table rebuilt perfectly!")

asyncio.run(fix())