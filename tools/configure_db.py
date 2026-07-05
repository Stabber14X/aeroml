import sys
import os
import asyncio
import re

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(current_dir, "..", "backend")
sys.path.append(backend_path)

try:
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
except ImportError:
    print("CRITICAL ERROR: run this script inside your backend virtual environment!")
    print("Usage: ")
    print("  cd backend")
    print("  venv\\Scripts\\activate")
    print("  cd ..")
    print("  python tools/configure_db.py")
    sys.exit(1)

async def test_async_connection(url):
    """Verifies the asyncpg connection identically to FastAPI's setup."""
    try:
        engine = create_async_engine(url, echo=False)
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        return True
    except Exception as e:
        print(f"[ERROR] Async connection failed: {e}")
        return False

def configure():
    print("\n--- AEROML DATABASE AUTO-CONFIG (ASYNC UNIFICATION) ---")
    print("The backend needs your PostgreSQL password to connect via asyncpg.")
    
    while True:
        password = input("\nEnter Postgres password (leave empty if you used 'trust'): ").strip()
        
        if password:
            final_url = f"postgresql+asyncpg://postgres:{password}@127.0.0.1/aeroml_v6"
        else:
            final_url = "postgresql+asyncpg://postgres@127.0.0.1/aeroml_v6"
            
        print(f"Testing AsyncPG connection with provided credentials...")
        
        success = asyncio.run(test_async_connection(final_url))
        
        if success:
            print("[SUCCESS] Async Connection Valid!")
            update_database_file(final_url)
            break
        else:
            print("Please try again.")

def update_database_file(new_url):
    db_file = os.path.join(backend_path, "app", "core", "config.py")
    
    try:
        with open(db_file, "r") as f:
            content = f.read()
            
        # Replace the SQLALCHEMY_DATABASE_URL safely using regex
        content = re.sub(
            r'SQLALCHEMY_DATABASE_URL\s*=\s*\(.*?\)', 
            f'SQLALCHEMY_DATABASE_URL = "{new_url}"', 
            content, 
            flags=re.DOTALL
        )
        
        with open(db_file, "w") as f:
            f.write(content)
        
        print(f"[FIXED] Successfully updated backend/app/core/config.py")
        print("You can now run the 'add_users_table.py' script again.")
        
    except Exception as e:
        print(f"[ERROR] Failed to write to config.py: {e}")

if __name__ == "__main__":
    configure()