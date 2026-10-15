import pytest

from trust_issues_backend.settings import Settings, SettingsError

GOOD = {
    "DATABASE_URL": "postgresql+asyncpg://u:p@db/trust",
    "JWT_SECRET": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
    "VERIFIER_URL": "http://verifier:8081",
    "VERIFIER_TOKEN": "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3",
}


def test_reads_all_values_from_the_environment() -> None:
    settings = Settings.from_env(GOOD)

    assert settings.database_url == GOOD["DATABASE_URL"]
    assert settings.verifier_url == GOOD["VERIFIER_URL"]
    assert settings.enable_docs is False


def test_enable_docs_is_opt_in() -> None:
    assert Settings.from_env({**GOOD, "ENABLE_DOCS": "true"}).enable_docs is True


@pytest.mark.parametrize("name", ["DATABASE_URL", "JWT_SECRET", "VERIFIER_URL", "VERIFIER_TOKEN"])
def test_requires_every_value(name: str) -> None:
    env = {key: value for key, value in GOOD.items() if key != name}

    with pytest.raises(SettingsError, match=name):
        Settings.from_env(env)


@pytest.mark.parametrize("name", ["JWT_SECRET", "VERIFIER_TOKEN"])
def test_rejects_short_secrets(name: str) -> None:
    with pytest.raises(SettingsError, match=name):
        Settings.from_env({**GOOD, name: "short"})


@pytest.mark.parametrize("name", ["JWT_SECRET", "VERIFIER_TOKEN"])
def test_rejects_placeholder_secrets(name: str) -> None:
    with pytest.raises(SettingsError, match=name):
        Settings.from_env({**GOOD, name: "change-me-change-me-change-me-change-me"})


def test_audit_retention_defaults_to_ninety_days() -> None:
    assert Settings.from_env(GOOD).audit_retention_days == 90


def test_audit_retention_can_be_set() -> None:
    assert Settings.from_env({**GOOD, "AUDIT_RETENTION_DAYS": "30"}).audit_retention_days == 30


@pytest.mark.parametrize("value", ["0", "-5", "abc", "1.5", "3651"])
def test_rejects_an_invalid_audit_retention(value: str) -> None:
    with pytest.raises(SettingsError, match="AUDIT_RETENTION_DAYS"):
        Settings.from_env({**GOOD, "AUDIT_RETENTION_DAYS": value})
