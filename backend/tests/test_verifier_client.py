import httpx
import pytest

from trust_issues_backend.verifier import (
    HttpVerifier,
    InvalidReplayError,
    UnknownLevelError,
    VerifiedRun,
    VerifierUnavailableError,
)


def make(handler) -> HttpVerifier:
    client = httpx.AsyncClient(
        base_url="http://verifier",
        headers={"x-verifier-token": "secret-token"},
        transport=httpx.MockTransport(handler),
    )
    return HttpVerifier(client)


async def test_returns_the_verified_run_and_sends_level_and_replay() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200, json={"finished": True, "frames": 290, "deaths": 1, "score": 975}
        )

    result = await make(handler).verify("trust-nothing", [2, 10])

    assert result == VerifiedRun(finished=True, frames=290, deaths=1, score=975)
    assert seen[0].url.path == "/verify"
    assert seen[0].headers["x-verifier-token"] == "secret-token"
    assert seen[0].read() == b'{"levelId":"trust-nothing","replay":[2,10]}'


async def test_maps_404_to_unknown_level() -> None:
    verifier = make(lambda _: httpx.Response(404, json={"error": "unknown level x"}))

    with pytest.raises(UnknownLevelError):
        await verifier.verify("x", [])


async def test_maps_400_to_invalid_replay() -> None:
    verifier = make(lambda _: httpx.Response(400, json={"error": "invalid input mask 9"}))

    with pytest.raises(InvalidReplayError, match="invalid input mask 9"):
        await verifier.verify("trust-nothing", [9, 1])


@pytest.mark.parametrize("status", [401, 413, 500, 502])
async def test_maps_other_failures_to_unavailable(status: int) -> None:
    verifier = make(lambda _: httpx.Response(status, json={"error": "nope"}))

    with pytest.raises(VerifierUnavailableError):
        await verifier.verify("trust-nothing", [])


async def test_maps_transport_errors_to_unavailable() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(VerifierUnavailableError):
        await make(handler).verify("trust-nothing", [])


async def test_maps_garbage_responses_to_unavailable() -> None:
    verifier = make(lambda _: httpx.Response(200, json={"unexpected": True}))

    with pytest.raises(VerifierUnavailableError):
        await verifier.verify("trust-nothing", [])
