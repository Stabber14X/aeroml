from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from typing import AsyncGenerator
from app.core.config import settings

engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URL,
    echo=False,
    future=True
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

# Migration helper function
async def run_migrations():
    """Run database migrations to add new columns"""
    from sqlalchemy import text
    async with engine.begin() as conn:
        # Add columns if they don't exist
        await conn.execute(text("""
            DO $$ 
            BEGIN
                -- Check and add is_admin
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='is_admin') THEN
                    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                END IF;
                
                -- Check and add is_premium
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='is_premium') THEN
                    ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE;
                END IF;
                
                -- Check and add is_active
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='is_active') THEN
                    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
                END IF;
                
                -- Check and add email_verified
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='email_verified') THEN
                    ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
                END IF;
                
                -- Check and add trial_started_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='trial_started_at') THEN
                    ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMP;
                END IF;
                
                -- Check and add trial_expires_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='trial_expires_at') THEN
                    ALTER TABLE users ADD COLUMN trial_expires_at TIMESTAMP;
                END IF;
                
                -- Check and add subscription_started_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='subscription_started_at') THEN
                    ALTER TABLE users ADD COLUMN subscription_started_at TIMESTAMP;
                END IF;
                
                -- Check and add subscription_expires_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='subscription_expires_at') THEN
                    ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP;
                END IF;
                
                -- Check and add reset_token
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='reset_token') THEN
                    ALTER TABLE users ADD COLUMN reset_token VARCHAR;
                END IF;
                
                -- Check and add reset_token_expires_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='reset_token_expires_at') THEN
                    ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP;
                END IF;
                
                -- Check and add verification_token
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='verification_token') THEN
                    ALTER TABLE users ADD COLUMN verification_token VARCHAR;
                END IF;
                
                -- Check and add verification_token_expires_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='verification_token_expires_at') THEN
                    ALTER TABLE users ADD COLUMN verification_token_expires_at TIMESTAMP;
                END IF;
                
                -- Check and add dodo_customer_id
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='dodo_customer_id') THEN
                    ALTER TABLE users ADD COLUMN dodo_customer_id VARCHAR;
                END IF;
                
                -- Check and add dodo_subscription_id
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='dodo_subscription_id') THEN
                    ALTER TABLE users ADD COLUMN dodo_subscription_id VARCHAR;
                END IF;
                
                -- Check and add created_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='created_at') THEN
                    ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
                END IF;
                
                -- Check and add updated_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                              WHERE table_name='users' AND column_name='updated_at') THEN
                    ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
                END IF;
                
                -- Create indexes for performance
                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);
                CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
                CREATE INDEX IF NOT EXISTS idx_users_trial_expires ON users(trial_expires_at);
                CREATE INDEX IF NOT EXISTS idx_users_subscription_expires ON users(subscription_expires_at);
                
            END $$;
        """))