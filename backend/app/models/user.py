# backend/app/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from datetime import datetime
from app.database import Base
import enum

class UserTier(enum.Enum):
    FREE = "free"
    PREMIUM = "premium"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"

    # FIXED: Removed Identity() - was causing sequence issues
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    tier = Column(String, default="free", nullable=False)
    
    is_admin = Column(Boolean, default=False)
    is_premium = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    
    trial_started_at = Column(DateTime, nullable=True)
    trial_expires_at = Column(DateTime, nullable=True)
    
    subscription_started_at = Column(DateTime, nullable=True)
    subscription_expires_at = Column(DateTime, nullable=True)
    
    reset_token = Column(String, nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    
    verification_token = Column(String, nullable=True)
    verification_token_expires_at = Column(DateTime, nullable=True)
    
    dodo_customer_id = Column(String, nullable=True)
    dodo_subscription_id = Column(String, nullable=True)
    
    force_password_change = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
