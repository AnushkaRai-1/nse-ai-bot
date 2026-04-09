from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.security import rate_limit


class DummyPipeline:
    def __init__(self):
        self.calls = []

    def incr(self, key: str):
        self.calls.append(("incr", key))

    def expire(self, key: str, seconds: int):
        self.calls.append(("expire", key, seconds))

    async def execute(self):
        self.calls.append(("execute",))


class DummyRedis:
    def __init__(self, current=None):
        self.current = current
        self.last_key = None
        self.pipe = DummyPipeline()

    async def get(self, key: str):
        self.last_key = key
        return self.current

    def pipeline(self):
        return self.pipe


@pytest.mark.anyio
async def test_check_rate_limit_raises_when_limit_exceeded(monkeypatch):
    redis = DummyRedis(current="5")

    async def fake_get_redis():
        return redis

    monkeypatch.setattr(rate_limit, "get_redis", fake_get_redis)

    with pytest.raises(HTTPException) as exc:
        await rate_limit.check_rate_limit("user:abc", limit=5)

    assert exc.value.status_code == 429
    assert redis.last_key == "rate:user:abc"


@pytest.mark.anyio
async def test_check_rate_limit_increments_when_under_limit(monkeypatch):
    redis = DummyRedis(current="2")

    async def fake_get_redis():
        return redis

    monkeypatch.setattr(rate_limit, "get_redis", fake_get_redis)

    await rate_limit.check_rate_limit("ip:1.2.3.4", limit=5, window_seconds=60)

    assert redis.last_key == "rate:ip:1.2.3.4"
    assert redis.pipe.calls == [
        ("incr", "rate:ip:1.2.3.4"),
        ("expire", "rate:ip:1.2.3.4", 60),
        ("execute",),
    ]


@pytest.mark.anyio
async def test_check_rate_limit_default_window_and_error_message(monkeypatch):
    redis = DummyRedis(current="1")

    async def fake_get_redis():
        return redis

    monkeypatch.setattr(rate_limit, "get_redis", fake_get_redis)

    await rate_limit.check_rate_limit("default-window", limit=5)
    assert redis.pipe.calls[1] == ("expire", "rate:default-window", 60)

    redis.current = "5"
    with pytest.raises(HTTPException) as exc:
        await rate_limit.check_rate_limit("default-window", limit=5)

    assert exc.value.status_code == 429
    assert exc.value.detail == "Rate limit exceeded. Try again later."


@pytest.mark.anyio
async def test_rate_limit_middleware_uses_user_id(monkeypatch):
    captured = {}

    async def fake_check_rate_limit(key, limit, window_seconds=60):
        captured["key"] = key
        captured["limit"] = limit
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(rate_limit, "check_rate_limit", fake_check_rate_limit)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_PER_MINUTE", 123)

    req = SimpleNamespace(
        state=SimpleNamespace(user_id="u-123"),
        headers={},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    await rate_limit.rate_limit_middleware(req)

    assert captured == {"key": "user:u-123", "limit": 123, "window_seconds": 60}


@pytest.mark.anyio
async def test_rate_limit_middleware_uses_forwarded_ip_and_explicit_limit(monkeypatch):
    captured = {}

    async def fake_check_rate_limit(key, limit, window_seconds=60):
        captured["key"] = key
        captured["limit"] = limit
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(rate_limit, "check_rate_limit", fake_check_rate_limit)

    req = SimpleNamespace(
        state=SimpleNamespace(),
        headers={"X-Forwarded-For": "203.0.113.9"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    await rate_limit.rate_limit_middleware(req, limit=7)

    assert captured == {"key": "ip:203.0.113.9", "limit": 7, "window_seconds": 60}


@pytest.mark.anyio
async def test_auth_rate_limit_uses_auth_prefix_and_setting(monkeypatch):
    captured = {}

    async def fake_check_rate_limit(key, limit, window_seconds=60):
        captured["key"] = key
        captured["limit"] = limit
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(rate_limit, "check_rate_limit", fake_check_rate_limit)
    monkeypatch.setattr(rate_limit.settings, "AUTH_RATE_LIMIT_PER_MINUTE", 10)

    req = SimpleNamespace(
        state=SimpleNamespace(),
        headers={},
        client=SimpleNamespace(host="10.0.0.5"),
    )

    await rate_limit.auth_rate_limit(req)

    assert captured == {"key": "auth:10.0.0.5", "limit": 10, "window_seconds": 60}


@pytest.mark.anyio
async def test_auth_rate_limit_prefers_forwarded_header(monkeypatch):
    captured = {}

    async def fake_check_rate_limit(key, limit, window_seconds=60):
        captured["key"] = key
        captured["limit"] = limit
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(rate_limit, "check_rate_limit", fake_check_rate_limit)
    monkeypatch.setattr(rate_limit.settings, "AUTH_RATE_LIMIT_PER_MINUTE", 10)

    req = SimpleNamespace(
        state=SimpleNamespace(),
        headers={"X-Forwarded-For": "203.0.113.55"},
        client=SimpleNamespace(host="10.0.0.5"),
    )

    await rate_limit.auth_rate_limit(req)

    assert captured == {"key": "auth:203.0.113.55", "limit": 10, "window_seconds": 60}
