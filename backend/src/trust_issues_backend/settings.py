"""Environment-driven settings, validated once at startup."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass

MIN_SECRET_LENGTH = 32
PLACEHOLDER = re.compile(r"change[-_ ]?me|example|placeholder", re.IGNORECASE)
ACCESS_TOKEN_MINUTES = 7 * 24 * 60
DEFAULT_AUDIT_RETENTION_DAYS = 90
MAX_AUDIT_RETENTION_DAYS = 3650
AUDIT_PURGE_INTERVAL_SECONDS = 3600.0


class SettingsError(Exception):
    """Raised when a required setting is missing or too weak to run with."""


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    jwt_secret: str
    verifier_url: str
    verifier_token: str
    enable_docs: bool = False
    access_token_minutes: int = ACCESS_TOKEN_MINUTES
    trusted_proxy_ips: tuple[str, ...] = ()
    audit_retention_days: int = DEFAULT_AUDIT_RETENTION_DAYS
    audit_purge_interval_seconds: float = AUDIT_PURGE_INTERVAL_SECONDS

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Reads and validates the settings; refuses to start with weak or placeholder secrets."""
        source = os.environ if env is None else env

        def required(name: str) -> str:
            value = source.get(name, "").strip()
            if not value:
                raise SettingsError(f"{name} is required")
            return value

        def secret(name: str) -> str:
            value = required(name)
            if len(value) < MIN_SECRET_LENGTH or PLACEHOLDER.search(value):
                raise SettingsError(
                    f"{name} must be a random value of at least {MIN_SECRET_LENGTH} characters"
                )
            return value

        retention = source.get("AUDIT_RETENTION_DAYS", "").strip()
        if retention and not (
            retention.isdecimal() and 1 <= int(retention) <= MAX_AUDIT_RETENTION_DAYS
        ):
            raise SettingsError(
                f"AUDIT_RETENTION_DAYS must be a whole number from 1 to {MAX_AUDIT_RETENTION_DAYS}"
            )

        return cls(
            database_url=required("DATABASE_URL"),
            jwt_secret=secret("JWT_SECRET"),
            verifier_url=required("VERIFIER_URL"),
            verifier_token=secret("VERIFIER_TOKEN"),
            enable_docs=source.get("ENABLE_DOCS", "").lower() == "true",
            trusted_proxy_ips=tuple(
                part.strip()
                for part in source.get("TRUSTED_PROXY_IPS", "").split(",")
                if part.strip()
            ),
            audit_retention_days=int(retention) if retention else DEFAULT_AUDIT_RETENTION_DAYS,
        )
