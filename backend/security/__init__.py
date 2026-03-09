"""
JWT RS256 Authentication — PRD Section 7.4 & 10.1
  - RS256 asymmetric keys (not HS256)
  - Access token: 15 minutes
  - Refresh token: 7 days, HttpOnly cookie
  - bcrypt cost factor 12 for password hashing
  - Account lockout after 10 failed attempts (15min lockout)
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.logging_config import get_logger
from backend.core.models import RefreshToken, User

settings = get_settings()
logger = get_logger(__name__)

# ── Password hashing — bcrypt cost factor 12 (PRD Section 10.1 A02) ──
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


# ═══════════════════════════════════════════════════════════════
# Password utilities
# ═══════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ═══════════════════════════════════════════════════════════════
# JWT Token creation/verification
# ═══════════════════════════════════════════════════════════════

def create_access_token(user_id: str, role: str) -> tuple[str, datetime]:
    """Create a short-lived access token (15 min default)."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.jwt_private_key, algorithm=settings.JWT_ALGORITHM)
    return token, expires


def create_refresh_token(user_id: str) -> tuple[str, datetime]:
    """Create a long-lived refresh token (7 days default)."""
    expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.jwt_private_key, algorithm=settings.JWT_ALGORITHM)
    return token, expires


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token using the public key."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as e:
        logger.warning("jwt_decode_failed", error=str(e))
        raise


def hash_token(token: str) -> str:
    """Hash a refresh token for storage (never store raw tokens in DB)."""
    return hashlib.sha256(token.encode()).hexdigest()


# ═══════════════════════════════════════════════════════════════
# User management
# ═══════════════════════════════════════════════════════════════

async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, password: str, name: str, role: str = "user") -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        name=name,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


async def check_account_lockout(db: AsyncSession, user: User) -> bool:
    """PRD Section 10.1 A07: Account lockout after 10 failed attempts, 15min lockout."""
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        return True  # Still locked
    if user.locked_until and user.locked_until <= datetime.now(timezone.utc):
        # Lockout expired — reset counter
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(failed_login_attempts=0, locked_until=None)
        )
    return False


async def record_failed_login(db: AsyncSession, user: User) -> None:
    new_count = (user.failed_login_attempts or 0) + 1
    values: dict = {"failed_login_attempts": new_count}
    if new_count >= 10:
        values["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
        logger.warning("account_locked", user_id=str(user.id), attempts=new_count)
    await db.execute(update(User).where(User.id == user.id).values(**values))


async def reset_failed_logins(db: AsyncSession, user: User) -> None:
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(failed_login_attempts=0, locked_until=None)
    )


# ═══════════════════════════════════════════════════════════════
# Refresh token storage
# ═══════════════════════════════════════════════════════════════

async def store_refresh_token(db: AsyncSession, user_id: str, token: str, expires: datetime) -> None:
    rt = RefreshToken(
        user_id=uuid.UUID(user_id),
        token_hash=hash_token(token),
        expires_at=expires,
    )
    db.add(rt)


async def validate_refresh_token(db: AsyncSession, token: str) -> RefreshToken | None:
    token_hash = hash_token(token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, token: str) -> None:
    token_hash = hash_token(token)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .values(revoked=True)
    )


async def revoke_all_user_tokens(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == uuid.UUID(user_id))
        .values(revoked=True)
    )
