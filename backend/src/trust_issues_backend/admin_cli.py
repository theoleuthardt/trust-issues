"""Command line to grant or revoke the admin flag: `python -m trust_issues_backend.admin_cli`."""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from trust_issues_backend.models import User
from trust_issues_backend.settings import Settings


async def set_admin(
    session_factory: async_sessionmaker[AsyncSession], username: str, value: bool
) -> bool:
    """Sets the admin flag of `username` (any spelling); False when there is no such user."""
    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.username_key == username.lower()))
        if user is None:
            return False
        user.is_admin = value
        await session.commit()
        return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Grant or revoke the admin flag of a user.")
    parser.add_argument("action", choices=["grant", "revoke"])
    parser.add_argument("username")
    args = parser.parse_args(argv)

    async def run() -> bool:
        engine = create_async_engine(Settings.from_env().database_url)
        try:
            return await set_admin(
                async_sessionmaker(engine), args.username, args.action == "grant"
            )
        finally:
            await engine.dispose()

    if not asyncio.run(run()):
        print(f"no user named {args.username}", file=sys.stderr)
        return 1
    print(f"{args.action}ed admin for {args.username}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
