"""同域 Web cookie 与 H5 Bearer 共存时，以显式请求身份结算。"""

import pytest

import db
from core import security
from tests.conftest import make_client


@pytest.fixture
def identities():
    users = ("auth-priority-a", "auth-priority-b")
    for uid in users:
        db.ex("INSERT INTO users(id,login,name,avatar,role) VALUES(?,?,?,?,?)", (uid, uid, uid, "", "user"))
    yield users
    for uid in users:
        db.ex("DELETE FROM progress_ops WHERE user_id=?", (uid,))
        db.ex("DELETE FROM progress WHERE user_id=?", (uid,))
        db.ex("DELETE FROM users WHERE id=?", (uid,))


def test_explicit_bearer_owns_read_and_progress_write(identities):
    user_a, user_b = identities
    with make_client() as client:
        client.cookies.set("session", security.sign_session(user_b))
        headers = {"Authorization": "Bearer " + security.sign_session(user_a)}
        assert client.get("/api/me", headers=headers).json()["id"] == user_a
        response = client.post(
            "/api/me/progress/sync",
            headers=headers,
            json={
                "operations": [
                    {
                        "opId": "auth-priority-op",
                        "kind": "checklist_use",
                        "occurredAt": "2026-11-04T06:00:00Z",
                        "payload": {},
                    }
                ]
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["checkuse"] == 1
        assert client.get("/api/me/progress").json()["checkuse"] == 0
        assert db.q("SELECT user_id FROM progress_ops WHERE op_id=?", ("auth-priority-op",))[0]["user_id"] == user_a


@pytest.mark.parametrize("authorization", ["Bearer invalid-token", "Basic invalid-token", ""])
def test_invalid_explicit_authorization_never_uses_cookie(identities, authorization):
    with make_client() as client:
        client.cookies.set("session", security.sign_session(identities[1]))
        assert client.get("/api/me", headers={"Authorization": authorization}).status_code == 401


def test_expired_explicit_bearer_never_uses_cookie(identities):
    with make_client() as client:
        client.cookies.set("session", security.sign_session(identities[1]))
        token = security.sign_session(identities[0], days=-1)
        assert client.get("/api/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_cookie_and_bearer_remain_independently_usable(identities):
    with make_client() as client:
        client.cookies.set("session", security.sign_session(identities[1]))
        assert client.get("/api/me").json()["id"] == identities[1]
        client.cookies.clear()
        token = security.sign_session(identities[0])
        assert client.get("/api/me", headers={"Authorization": "bearer " + token}).json()["id"] == identities[0]
