# backend/test_subscription.py
import asyncio
import httpx
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"

async def test_subscription():
    print("=" * 60)
    print("🔍 TESTING SUBSCRIPTION SYSTEM")
    print("=" * 60)
    
    # 1. Test signup
    print("\n[1] Testing signup...")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/auth/signup",
            json={
                "email": f"test_{datetime.now().timestamp()}@example.com",
                "password": "TestPassword123!",
                "plan": "freemium"
            }
        )
        print(f"    Signup response: {response.status_code}")
        if response.status_code != 200:
            print(f"    Error: {response.text}")
            return
        
        data = response.json()
        print(f"    User created: {data.get('user_id')}")
        print(f"    Plan: {data.get('plan')}")
        
        # 2. Test login
        print("\n[2] Testing login...")
        login_response = await client.post(
            f"{BASE_URL}/auth/login",
            json={
                "email": data.get("email"),
                "password": "TestPassword123!"
            }
        )
        print(f"    Login response: {login_response.status_code}")
        if login_response.status_code != 200:
            print(f"    Error: {login_response.text}")
            return
        
        login_data = login_response.json()
        token = login_data.get("access_token")
        print(f"    Token obtained: {token[:20]}...")
        
        # 3. Test protected endpoint
        print("\n[3] Testing protected endpoint...")
        protected_response = await client.get(
            f"{BASE_URL}/airfoils/count",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"    Protected endpoint response: {protected_response.status_code}")
        
        # 4. Test subscription status
        print("\n[4] Testing subscription status...")
        status_response = await client.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"    Status response: {status_response.status_code}")
        if status_response.status_code == 200:
            status_data = status_response.json()
            print(f"    Subscription type: {status_data.get('type')}")
            print(f"    Hours left: {status_data.get('hours_left')}")
            print(f"    Is active: {status_data.get('is_active')}")
        
        # 5. Test admin access (should fail for non-admin)
        print("\n[5] Testing admin access (should fail)...")
        admin_response = await client.get(
            f"{BASE_URL}/admin/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"    Admin access response: {admin_response.status_code} (expected 403)")
        
        print("\n" + "=" * 60)
        print("✅ SUBSCRIPTION TESTS COMPLETE")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_subscription())