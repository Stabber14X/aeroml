import asyncio
from app.database import engine
from sqlalchemy import text

async def fix_schema():
    async with engine.begin() as conn:
        print('Adding force_password_change column...')
        try:
            await conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE'))
            print('  ✅ Added force_password_change')
        except Exception as e:
            print(f'  ⚠️ Could not add force_password_change: {e}')
        
        print('Adding tier column...')
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR DEFAULT 'free'"))
            print('  ✅ Added tier')
        except Exception as e:
            print(f'  ⚠️ Could not add tier: {e}')
        
        print('Adding dodo_customer_id column...')
        try:
            await conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_customer_id VARCHAR'))
            print('  ✅ Added dodo_customer_id')
        except Exception as e:
            print(f'  ⚠️ Could not add dodo_customer_id: {e}')
        
        print('Adding dodo_subscription_id column...')
        try:
            await conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_subscription_id VARCHAR'))
            print('  ✅ Added dodo_subscription_id')
        except Exception as e:
            print(f'  ⚠️ Could not add dodo_subscription_id: {e}')
        
        print('')
        print('✅ Schema fix completed!')

asyncio.run(fix_schema())
