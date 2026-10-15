"""Client of the replay verifier service."""

from dataclasses import dataclass
from typing import Protocol

import httpx


@dataclass(frozen=True, slots=True)
class VerifiedRun:
    finished: bool
    frames: int
    deaths: int
    score: int


class VerifierError(Exception):
    """Base class for everything the verifier can answer with."""


class UnknownLevelError(VerifierError):
    """The verifier does not know the submitted level id."""


class InvalidReplayError(VerifierError):
    """The replay is malformed or longer than the level allows."""


class VerifierUnavailableError(VerifierError):
    """The verifier could not be reached or answered something unusable."""


class Verifier(Protocol):
    async def verify(
        self, level_id: str, replay: list[int], request_id: str | None = None
    ) -> VerifiedRun: ...


class HttpVerifier:
    """Talks to the Node verifier over the internal network with a shared token."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def verify(
        self, level_id: str, replay: list[int], request_id: str | None = None
    ) -> VerifiedRun:
        headers = {"x-request-id": request_id} if request_id else None
        try:
            response = await self._client.post(
                "/verify", json={"levelId": level_id, "replay": replay}, headers=headers
            )
        except httpx.HTTPError as error:
            raise VerifierUnavailableError(str(error)) from error

        if response.status_code == 404:
            raise UnknownLevelError(level_id)
        if response.status_code == 400:
            raise InvalidReplayError(_error_message(response))
        if response.status_code != 200:
            raise VerifierUnavailableError(f"verifier answered {response.status_code}")

        try:
            body = response.json()
            return VerifiedRun(
                finished=bool(body["finished"]),
                frames=int(body["frames"]),
                deaths=int(body["deaths"]),
                score=int(body["score"]),
            )
        except (ValueError, KeyError, TypeError) as error:
            raise VerifierUnavailableError("verifier sent an unusable response") from error


def _error_message(response: httpx.Response) -> str:
    try:
        return str(response.json()["error"])
    except (ValueError, KeyError, TypeError):
        return "invalid replay"
