import sys
import os
import asyncio

# FIX PATH
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(current_dir, "..", "backend")
sys.path.append(backend_path)

from app.database import engine, Base
from app.models.user import User

async def init_models():
    print("--- UPDATING DATABASE SCHEMA ---")
    
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[SUCCESS] User table created successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to create table. Check password in config.py: {e}")

if __name__ == "__main__":
    asyncio.run(init_models())