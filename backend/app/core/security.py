from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

# --- Argon2 Configuration ---
# Argon2 is the current state-of-the-art password hashing scheme.
# It resolves the 72-byte limit bug and eliminates the bcrypt-related ValueErrors.

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# CRITICAL FIX: Switch scheme from bcrypt to argon2
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# We no longer need BCRYPT_MAX_LENGTH or _truncate_password!

def verify_password(plain_password: str, hashed_password: str):
    """Verifies a plain password against an Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str):
    """Hashes the input password using Argon2."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "sub": data.get("sub")})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt