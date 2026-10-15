import json
import logging

import pytest
from litestar.testing import AsyncTestClient

from tests.conftest import PASSWORD, FakeVerifier, auth_headers, register

ACCESS = "trust_issues.access"


def access_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == ACCESS]


async def test_logs_one_line_per_request_with_the_request_id(
    client: AsyncTestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger=ACCESS)

    response = await client.get("/health")

    records = access_records(caplog)
    assert len(records) == 1
    fields = records[0].__dict__
    assert fields["method"] == "GET"
    assert fields["path"] == "/health"
    assert fields["status"] == 200
    assert fields["duration_ms"] >= 0
    assert fields["request_id"] == response.headers["x-request-id"]


async def test_keeps_a_sane_incoming_request_id_and_replaces_a_bad_one(
    client: AsyncTestClient,
) -> None:
    kept = await client.get("/health", headers={"X-Request-ID": "trace-1234abcd"})
    replaced = await client.get("/health", headers={"X-Request-ID": "x y\nz"})

    assert kept.headers["x-request-id"] == "trace-1234abcd"
    assert replaced.headers["x-request-id"] != "x y\nz"
    assert len(replaced.headers["x-request-id"]) >= 16


async def test_error_responses_are_logged_and_carry_the_id(
    client: AsyncTestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger=ACCESS)

    response = await client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["x-request-id"]
    statuses = [record.__dict__["status"] for record in access_records(caplog)]
    assert statuses == [401]


async def test_logs_the_user_id_of_authenticated_requests(
    client: AsyncTestClient, caplog: pytest.LogCaptureFixture
) -> None:
    headers = await auth_headers(client, "mallory")
    caplog.clear()
    caplog.set_level(logging.INFO, logger=ACCESS)

    await client.get("/api/auth/me", headers=headers)

    assert access_records(caplog)[0].__dict__["user_id"] == 1


async def test_never_logs_passwords_or_tokens(
    client: AsyncTestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    await register(client, "mallory")
    response = await client.post(
        "/api/auth/login", json={"username": "mallory", "password": PASSWORD}
    )
    token = response.json()["access_token"]
    await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    everything = " ".join(
        json.dumps(record.__dict__, default=str) + record.getMessage() for record in caplog.records
    )

    assert PASSWORD not in everything
    assert token not in everything


async def test_passes_the_request_id_to_the_verifier(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": [2, 60]},
        headers={**headers, "X-Request-ID": "trace-abcdef12"},
    )

    assert response.headers["x-request-id"] == "trace-abcdef12"
    assert verifier.request_ids == ["trace-abcdef12"]
