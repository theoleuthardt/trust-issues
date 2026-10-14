from litestar.testing import AsyncTestClient


async def test_health_reports_ok_without_authentication(client: AsyncTestClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
