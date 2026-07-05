# tools/fix_users_table.py
import asyncio
import sys
import os

# Add backend to path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(current_dir, "..", "backend")
sys.path.append(backend_path)

from app.database import engine, Base
from app.models.user import User
from sqlalchemy import text

async def fix_users():
    print("=" * 60)
    print("🔧 FIXING USERS TABLE")
    print("=" * 60)
    
    try:
        async with engine.begin() as conn:
            # 1. Drop the existing users table if it exists
            print("[1/3] Dropping existing users table...")
            await conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
            print("  ✅ Dropped")
            
            # 2. Recreate the users table using SQLAlchemy model
            print("[2/3] Recreating users table...")
            await conn.run_sync(Base.metadata.create_all)
            print("  ✅ Created")
            
            # 3. Verify
            print("[3/3] Verifying...")
            result = await conn.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar()
            print(f"  ✅ Users table created. Current users: {count}")
            
            print("\n" + "=" * 60)
            print("✅ USERS TABLE FIXED SUCCESSFULLY!")
            print("=" * 60)
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(fix_users())