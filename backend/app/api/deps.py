"""Shared FastAPI dependencies."""
from __future__ import annotations

import datetime as dt
from typing import Annotated, Optional

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.models.task import TaskBlock
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
) -> User:
    err = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if creds is None:
        raise err
    payload = decode_access_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise err
    try:
        user = await User.get(PydanticObjectId(payload["sub"]))
    except (InvalidId, TypeError):
        raise err
    if user is None:
        raise err
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def client_today(x_client_date: Annotated[Optional[str], Header()] = None) -> dt.date:
    """The user's *local* calendar date (sent by the SPA as ``X-Client-Date``), else server UTC date."""
    if x_client_date:
        try:
            return dt.date.fromisoformat(x_client_date)
        except ValueError:
            pass
    return dt.datetime.now(dt.timezone.utc).date()


ClientToday = Annotated[dt.date, Depends(client_today)]


def parse_oid(value: str, what: str = "id") -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


async def get_owned_task(task_id: str, user: User) -> TaskBlock:
    task = await TaskBlock.get(parse_oid(task_id, "Task"))
    if task is None or task.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task
