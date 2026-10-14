from litestar.testing import AsyncTestClient

from tests.conftest import auth_headers


async def test_rejects_request_bodies_over_the_size_limit(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/runs",
        content=b"x" * (300 * 1024),
        headers={**headers, "content-type": "application/json"},
    )

    assert response.status_code == 413


async def test_accepts_a_maximum_size_replay_within_the_limit(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": [0, 1] * 10000},
        headers=headers,
    )

    assert response.status_code == 201
