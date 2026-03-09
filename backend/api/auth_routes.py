"""
Auth API routes — PRD Section 7.1
POST /api/v1/auth/register  — Create account
POST /api/v1/auth/login     — Returns JWT access + refresh tokens
POST /api/v1/auth/refresh   — Issue new access token
POST /api/v1/auth/logout    — Invalidate refresh token
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.schemas import TokenResponse, UserLogin, UserRegister, UserResponse
from backend.security import (
    check_account_lockout,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_user_by_email,
    hash_password,
    record_failed_login,
    reset_failed_logins,
    revoke_all_user_tokens,
    revoke_refresh_token,
    store_refresh_token,
    validate_refresh_token,
    verify_password,
)
from backend.security.rate_limit import auth_rate_limit
from backend.api import get_current_user
from backend.core.logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user account."""
    await auth_rate_limit(request)

    existing = await get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = await create_user(db, data.email, data.password, data.name)
    logger.info("user_registered", user_id=str(user.id), email=data.email)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and return JWT tokens."""
    await auth_rate_limit(request)

    user = await get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Check lockout (PRD Section 10.1 A07)
    if await check_account_lockout(db, user):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
        )

    if not verify_password(data.password, user.password_hash):
        await record_failed_login(db, user)
        await db.commit()
        logger.warning("login_failed", email=data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Success — reset failed attempts and issue tokens
    await reset_failed_logins(db, user)

    access_token, access_expires = create_access_token(str(user.id), user.role)
    refresh_token, refresh_expires = create_refresh_token(str(user.id))

    # Store refresh token hash in DB
    await store_refresh_token(db, str(user.id), refresh_token, refresh_expires)
    await db.commit()

    # Set refresh token as HttpOnly cookie (PRD Section 7.4)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,       # HTTPS only
        samesite="strict",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/api/v1/auth",
    )

    logger.info("login_success", user_id=str(user.id))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=60 * 15,  # 15 minutes in seconds
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Issue a new access token using the refresh token from cookie."""
    await auth_rate_limit(request)

    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    # Validate refresh token
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # Check DB for revocation
    stored = await validate_refresh_token(db, refresh_token)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked or expired",
        )

    user_id = payload["sub"]
    user = await __import__("backend.security", fromlist=["get_user_by_id"]).get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Rotate: revoke old, issue new
    await revoke_refresh_token(db, refresh_token)

    access_token, _ = create_access_token(user_id, user.role)
    new_refresh, new_refresh_expires = create_refresh_token(user_id)
    await store_refresh_token(db, user_id, new_refresh, new_refresh_expires)
    await db.commit()

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 7,
        path="/api/v1/auth",
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=60 * 15,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user=Depends(get_current_user),
):
    """Return authenticated user profile from JWT."""
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Invalidate all refresh tokens for this user."""
    await revoke_all_user_tokens(db, str(current_user.id))
    await db.commit()

    response.delete_cookie("refresh_token", path="/api/v1/auth")
    logger.info("user_logged_out", user_id=str(current_user.id))


# ── Profile & Password Management ───────────────────────────────────


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update current user profile (name)."""
    if data.name is not None:
        current_user.name = data.name

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    logger.info("profile_updated", user_id=str(current_user.id))
    return current_user


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Change current user's password. Requires current password."""
    # Validate new password has uppercase + digit
    if not any(c.isupper() for c in data.new_password):
        raise HTTPException(status_code=422, detail="New password must contain at least 1 uppercase letter")
    if not any(c.isdigit() for c in data.new_password):
        raise HTTPException(status_code=422, detail="New password must contain at least 1 digit")

    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        )

    # Update password
    current_user.password_hash = hash_password(data.new_password)
    db.add(current_user)
    await db.commit()

    logger.info("password_changed", user_id=str(current_user.id))
    return {"message": "Password changed successfully"}
