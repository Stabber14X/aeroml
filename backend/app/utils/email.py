# backend/app/utils/email.py
import resend
import os
from datetime import datetime
from typing import Optional
from app.core.config import settings

# Initialize Resend with API key
resend.api_key = settings.RESEND_API_KEY

async def send_verification_email(email: str, token: str, username: str = "User"):
    """Send email verification link"""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    verification_link = f"{frontend_url}/auth/verify-email?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ text-align: center; padding: 20px 0; border-bottom: 2px solid #007AFF; }}
            .logo {{ font-size: 28px; font-weight: bold; color: #007AFF; }}
            .content {{ padding: 30px 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #007AFF; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px 0; border-top: 1px solid #e0e0e0; color: #666666; font-size: 12px; }}
            .warning {{ color: #ff6b6b; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">✈️ AeroML</div>
                <p style="color: #666666;">AI-Powered Aerodynamic Design</p>
            </div>
            <div class="content">
                <h2>Welcome to AeroML, {username}!</h2>
                <p>Thank you for signing up. Please verify your email address to start using the platform.</p>
                <p style="text-align: center;">
                    <a href="{verification_link}" class="button">Verify Email Address</a>
                </p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background: #f4f6f9; padding: 10px; border-radius: 5px; font-size: 12px;">
                    {verification_link}
                </p>
                <p class="warning">⚠️ This link expires in 24 hours.</p>
                <p>If you didn't create an account with AeroML, please ignore this email.</p>
            </div>
            <div class="footer">
                <p>© 2026 AeroML. All rights reserved.</p>
                <p>Built by Hassnain Sajid & Abeeha Raza</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        response = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": "Verify Your AeroML Account",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Email send error: {e}")
        return None

async def send_reset_password_email(email: str, token: str, username: str = "User"):
    """Send password reset link"""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend_url}/auth/reset-password?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ text-align: center; padding: 20px 0; border-bottom: 2px solid #ff6b6b; }}
            .logo {{ font-size: 28px; font-weight: bold; color: #ff6b6b; }}
            .content {{ padding: 30px 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #ff6b6b; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px 0; border-top: 1px solid #e0e0e0; color: #666666; font-size: 12px; }}
            .warning {{ color: #ff6b6b; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🔐 AeroML</div>
                <p style="color: #666666;">Password Reset</p>
            </div>
            <div class="content">
                <h2>Reset Your Password, {username}</h2>
                <p>We received a request to reset your password for your AeroML account.</p>
                <p style="text-align: center;">
                    <a href="{reset_link}" class="button">Reset Password</a>
                </p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background: #f4f6f9; padding: 10px; border-radius: 5px; font-size: 12px;">
                    {reset_link}
                </p>
                <p class="warning">⚠️ This link expires in 15 minutes.</p>
                <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
            <div class="footer">
                <p>© 2026 AeroML. All rights reserved.</p>
                <p>Built by Hassnain Sajid & Abeeha Raza</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        response = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": "Reset Your AeroML Password",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Email send error: {e}")
        return None

async def send_trial_expiry_warning(email: str, username: str = "User", hours_left: int = 1):
    """Send trial expiry warning email"""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ text-align: center; padding: 20px 0; border-bottom: 2px solid #f59e0b; }}
            .logo {{ font-size: 28px; font-weight: bold; color: #f59e0b; }}
            .content {{ padding: 30px 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px 0; border-top: 1px solid #e0e0e0; color: #666666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">⏰ AeroML</div>
                <p style="color: #666666;">Trial Expiring Soon</p>
            </div>
            <div class="content">
                <h2>Your Free Trial Ends in {hours_left} Hour{'' if hours_left == 1 else 's'}</h2>
                <p>Hi {username},</p>
                <p>Your 24-hour free trial is about to expire. Don't lose access to your designs!</p>
                <p style="text-align: center;">
                    <a href="{frontend_url}/pricing" class="button">Upgrade to Premium Now</a>
                </p>
                <p>Upgrade today and continue using all features:</p>
                <ul>
                    <li>✅ All aerodynamic tools</li>
                    <li>✅ Unlimited designs</li>
                    <li>✅ All export formats</li>
                    <li>✅ Priority support</li>
                </ul>
                <p><strong>Price: $19/month</strong> - Cancel anytime.</p>
            </div>
            <div class="footer">
                <p>© 2026 AeroML. All rights reserved.</p>
                <p>Built by Hassnain Sajid & Abeeha Raza</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        response = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": f"Your AeroML Free Trial Ends in {hours_left} Hour{'' if hours_left == 1 else 's'}",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Email send error: {e}")
        return None

async def send_subscription_expiry_warning(email: str, username: str = "User", days_left: int = 2):
    """Send premium subscription expiry warning email"""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ text-align: center; padding: 20px 0; border-bottom: 2px solid #ef4444; }}
            .logo {{ font-size: 28px; font-weight: bold; color: #ef4444; }}
            .content {{ padding: 30px 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #ef4444; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px 0; border-top: 1px solid #e0e0e0; color: #666666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🔴 AeroML</div>
                <p style="color: #666666;">Subscription Expiring Soon</p>
            </div>
            <div class="content">
                <h2>Your Premium Subscription Expires in {days_left} Day{'' if days_left == 1 else 's'}</h2>
                <p>Hi {username},</p>
                <p>Your premium subscription is about to expire. Renew now to continue uninterrupted access.</p>
                <p style="text-align: center;">
                    <a href="{frontend_url}/pricing" class="button">Renew Now - $19/month</a>
                </p>
                <p>What you'll keep with premium:</p>
                <ul>
                    <li>✅ All aerodynamic tools</li>
                    <li>✅ Unlimited designs</li>
                    <li>✅ All export formats</li>
                    <li>✅ Priority support</li>
                </ul>
                <p><strong>Renew now</strong> and your subscription will extend by 30 days.</p>
            </div>
            <div class="footer">
                <p>© 2026 AeroML. All rights reserved.</p>
                <p>Built by Hassnain Sajid & Abeeha Raza</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        response = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": f"Your AeroML Premium Expires in {days_left} Day{'' if days_left == 1 else 's'}",
            "html": html_content
        })
        return response
    except Exception as e:
        print(f"Email send error: {e}")
        return None