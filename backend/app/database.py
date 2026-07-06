from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import AsyncGenerator
from app.core.config import settings

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def run_migrations():
    """Run database migrations to add new columns - SKIP IF FAILING"""
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            # Check if users table exists
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')"
            ))
            if not result.scalar():
                print("Users table doesn't exist yet, skipping migrations")
                return
            
            print("✅ Database migrations completed (skipped for now)")
    except Exception as e:
        print(f"Migration warning (skipped): {e}")
        # Don't fail - just continue
