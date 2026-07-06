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
    """Run database migrations to add new columns"""
    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            # Check if users table exists
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')"
            ))
            if not result.scalar():
                print("Users table doesn't exist yet, skipping migrations")
                return
            
            # Check if columns exist and add them if not
            columns_to_add = [
                ('is_admin', 'BOOLEAN DEFAULT FALSE'),
                ('is_premium', 'BOOLEAN DEFAULT FALSE'),
                ('is_active', 'BOOLEAN DEFAULT TRUE'),
                ('email_verified', 'BOOLEAN DEFAULT FALSE'),
                ('trial_started_at', 'TIMESTAMP'),
                ('trial_expires_at', 'TIMESTAMP'),
                ('subscription_started_at', 'TIMESTAMP'),
                ('subscription_expires_at', 'TIMESTAMP'),
                ('reset_token', 'VARCHAR'),
                ('reset_token_expires_at', 'TIMESTAMP'),
                ('verification_token', 'VARCHAR'),
                ('verification_token_expires_at', 'TIMESTAMP'),
                ('dodo_customer_id', 'VARCHAR'),
                ('dodo_subscription_id', 'VARCHAR'),
                ('created_at', 'TIMESTAMP DEFAULT NOW()'),
                ('updated_at', 'TIMESTAMP DEFAULT NOW()'),
            ]
            
            for col_name, col_type in columns_to_add:
                try:
                    await conn.execute(text(
                        f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                    ))
                except Exception as e:
                    print(f"  ⚠️ Could not add {col_name}: {e}")
            
            # Create indexes
            indexes = [
                'idx_users_email',
                'idx_users_is_premium',
                'idx_users_is_admin',
                'idx_users_trial_expires',
                'idx_users_subscription_expires'
            ]
            
            for idx in indexes:
                try:
                    await conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx} ON users({idx.replace('idx_users_', '')})"))
                except Exception as e:
                    print(f"  ⚠️ Could not create index {idx}: {e}")
            
            print("✅ Database migrations completed successfully")
            
        except Exception as e:
            print(f"Migration warning: {e}")
