"""Writes the OpenAPI schema of the API as JSON, for the generated frontend client."""

import json
import sys
from pathlib import Path

from trust_issues_backend.app import create_app
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import VerifiedRun


class _NoVerifier:
    """Stands in for the verifier: building the schema never calls it."""

    async def levels(self) -> list[str]:
        raise NotImplementedError

    async def verify(
        self,
        level_id: str,
        replay: list[int],
        sim_version: int,
        level_revision: int,
        request_id: str | None = None,
    ) -> VerifiedRun:
        raise NotImplementedError


def main(target: Path) -> None:
    settings = Settings(
        database_url="sqlite+aiosqlite://",
        jwt_secret="x" * 32,
        verifier_url="http://verifier.invalid",
        verifier_token="y" * 32,
        enable_docs=True,
    )
    schema = create_app(settings, verifier=_NoVerifier()).openapi_schema.to_schema()
    target.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
