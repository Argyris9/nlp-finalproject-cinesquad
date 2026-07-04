"""In-memory session store for CineSync group-recommendation sessions.

For production, replace this with Redis/PostgreSQL -- in-memory is fine for
this academic prototype (single backend process, no login, short-lived
sessions), but state is lost on server restart and won't work across
multiple backend processes/workers.
"""

from __future__ import annotations

import random
import string
import time
from dataclasses import dataclass, field

from fastapi import HTTPException

MIN_SESSION_USERS = 2
DEFAULT_MAX_SESSION_USERS = 4
SESSION_CODE_LENGTH = 6
SESSION_CODE_ALPHABET = string.ascii_uppercase + string.digits


@dataclass
class SessionUser:
    user_id: str
    display_name: str
    ready: bool = False
    preferences: dict | None = None
    device_id: str | None = None


@dataclass
class Session:
    session_id: str
    created_at: float
    max_users: int
    status: str = "waiting"  # waiting | ready | recommended | expired
    users: dict[str, SessionUser] = field(default_factory=dict)
    recommendations: list[dict] | None = None
    chat_history: list[dict] = field(default_factory=list)


class SessionService:
    def __init__(self):
        self._sessions: dict[str, Session] = {}

    def _generate_code(self) -> str:
        while True:
            code = "".join(random.choices(SESSION_CODE_ALPHABET, k=SESSION_CODE_LENGTH))
            if code not in self._sessions:
                return code

    def create_session(
        self, creator_name: str, max_users: int = DEFAULT_MAX_SESSION_USERS, device_id: str | None = None
    ) -> tuple[Session, SessionUser]:
        session_id = self._generate_code()
        session = Session(session_id=session_id, created_at=time.time(), max_users=max_users)
        creator = SessionUser(user_id=self._generate_user_id(), display_name=creator_name, device_id=device_id)
        session.users[creator.user_id] = creator
        self._sessions[session_id] = session
        return session, creator

    def _generate_user_id(self) -> str:
        return "u_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))

    def get_session(self, session_id: str) -> Session:
        session = self._sessions.get(session_id.upper())
        if session is None:
            raise HTTPException(404, f"Session '{session_id}' not found")
        return session

    def join_session(
        self, session_id: str, display_name: str, device_id: str | None = None
    ) -> tuple[Session, SessionUser, bool]:
        """Returns (session, user, rejoined). If `device_id` matches a user
        already in the session (same browser hitting join again -- e.g. the
        back button, a refresh, or resubmitting the join form), returns that
        existing user instead of creating a duplicate participant. This
        check runs before the full-session check, so a device that already
        has a seat is never blocked from returning to it."""
        session = self.get_session(session_id)

        if device_id:
            existing = next((u for u in session.users.values() if u.device_id == device_id), None)
            if existing is not None:
                return session, existing, True

        if len(session.users) >= session.max_users:
            raise HTTPException(400, f"Session '{session_id}' is full (max {session.max_users} users)")
        user = SessionUser(user_id=self._generate_user_id(), display_name=display_name, device_id=device_id)
        session.users[user.user_id] = user
        return session, user, False

    def get_user(self, session: Session, user_id: str) -> SessionUser:
        user = session.users.get(user_id)
        if user is None:
            raise HTTPException(404, f"User '{user_id}' not found in session '{session.session_id}'")
        return user

    def submit_preferences(self, session_id: str, user_id: str, preferences: dict) -> Session:
        session = self.get_session(session_id)
        user = self.get_user(session, user_id)
        user.preferences = preferences
        user.ready = True
        if self.all_users_ready(session) and self.min_users_reached(session):
            session.status = "ready"
        return session

    def min_users_reached(self, session: Session) -> bool:
        return len(session.users) >= MIN_SESSION_USERS

    def all_users_ready(self, session: Session) -> bool:
        return len(session.users) > 0 and all(u.ready for u in session.users.values())

    def mark_recommended(self, session: Session, recommendations: list[dict]) -> None:
        session.recommendations = recommendations
        session.status = "recommended"


session_service = SessionService()
