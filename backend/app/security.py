from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import settings
from app.errors import Unauthenticated


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# A real bcrypt hash of a random string: verified against when the email is unknown so that
# login timing does not reveal which emails exist.
DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


def create_access_token(user_id: int, role: str) -> tuple[str, int]:
    expires_in = settings.access_token_minutes * 60
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "role": role, "iat": now, "exp": now + timedelta(seconds=expires_in)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_in


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise Unauthenticated("Invalid or expired token.") from exc
