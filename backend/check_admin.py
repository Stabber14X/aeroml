import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("SELECT email, is_admin, tier FROM users"))
        rows = result.fetchall()
        print("\n📋 ALL USERS:\n")
        for row in rows:
            admin = "✅ ADMIN" if row[1] else "   USER"
            print(f"{admin} | {row[0]} | tier: {row[2]}")

if __name__ == "__main__":
    asyncio.run(check())
