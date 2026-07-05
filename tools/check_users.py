# tools/check_users.py
import asyncio
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(current_dir, "..", "backend")
sys.path.append(backend_path)

from app.database import engine
from sqlalchemy import text

async def check_users():
    print("=" * 60)
    print("🔍 CHECKING USERS TABLE")
    print("=" * 60)
    
    try:
        async with engine.begin() as conn:
            # Check if users table exists
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')"
            ))
            exists = result.scalar()
            
            if exists:
                print("✅ Users table EXISTS")
                
                # Count users
                result = await conn.execute(text("SELECT COUNT(*) FROM users"))
                count = result.scalar()
                print(f"   Total users: {count}")
                
                # Show users
                result = await conn.execute(text("SELECT id, email FROM users LIMIT 5"))
                users = result.fetchall()
                if users:
                    print("   Sample users:")
                    for u in users:
                        print(f"     - ID: {u[0]}, Email: {u[1]}")
                else:
                    print("   No users found. Please sign up.")
            else:
                print("❌ Users table does NOT exist!")
                print("   Run: python tools/fix_users_table.py")
                
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_users())