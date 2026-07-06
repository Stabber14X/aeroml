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
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')"
            ))
            if not result.scalar():
                print("Users table doesn't exist yet, skipping migrations")
                return
                
            await conn.execute(text("""
                DO utf8 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='is_admin') THEN
                        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='is_premium') THEN
                        ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='is_active') THEN
                        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='email_verified') THEN
                        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='trial_started_at') THEN
                        ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='trial_expires_at') THEN
                        ALTER TABLE users ADD COLUMN trial_expires_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='subscription_started_at') THEN
                        ALTER TABLE users ADD COLUMN subscription_started_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='subscription_expires_at') THEN
                        ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='reset_token') THEN
                        ALTER TABLE users ADD COLUMN reset_token VARCHAR;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='reset_token_expires_at') THEN
                        ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='verification_token') THEN
                        ALTER TABLE users ADD COLUMN verification_token VARCHAR;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='verification_token_expires_at') THEN
                        ALTER TABLE users ADD COLUMN verification_token_expires_at TIMESTAMP;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='dodo_customer_id') THEN
                        ALTER TABLE users ADD COLUMN dodo_customer_id VARCHAR;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='dodo_subscription_id') THEN
                        ALTER TABLE users ADD COLUMN dodo_subscription_id VARCHAR;
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='created_at') THEN
                        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
                    END IF;
                    
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                  WHERE table_name='users' AND column_name='updated_at') THEN
                        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
                    END IF;
                    
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                    CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);
                    CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
                    CREATE INDEX IF NOT EXISTS idx_users_trial_expires ON users(trial_expires_at);
                    CREATE INDEX IF NOT EXISTS idx_users_subscription_expires ON users(subscription_expires_at);
                    
                END utf8;
            """))
        except Exception as e:
            print(f"Migration warning: {e}")
