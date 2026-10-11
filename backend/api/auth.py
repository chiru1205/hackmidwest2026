"""Demo-level role gate. Staff routes need the city token (header X-Role-Token); citizens do not.
Not real security: a shared demo token. With CITY_TOKEN unset or empty nothing is enforced."""
from __future__ import annotations

import hmac
import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, Query


def city_token() -> str:
    return (os.getenv("CITY_TOKEN") or "").strip()


def _check(supplied: Optional[str]) -> None:
    want = city_token()
    if not want:
        return
    if not supplied or not hmac.compare_digest(supplied.encode(), want.encode()):
        raise HTTPException(403, "city staff only")


_INTERNAL = secrets.token_hex(16)   # per process: only code running inside this API (the DevRev poller) knows it


def internal_token() -> str:
    return _INTERNAL


def is_internal(supplied: Optional[str]) -> bool:
    return bool(supplied) and hmac.compare_digest(supplied.encode(), _INTERNAL.encode())


def require_staff(x_role_token: Optional[str] = Header(None)) -> None:
    _check(x_role_token)


def require_staff_events(x_role_token: Optional[str] = Header(None), token: Optional[str] = Query(None)) -> None:
    """The /events stream: EventSource cannot send headers, so ?token= is also accepted here."""
    _check(x_role_token or token)
