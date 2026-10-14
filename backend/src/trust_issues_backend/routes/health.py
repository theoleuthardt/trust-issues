from litestar import get
from litestar.di import NamedDependency
from litestar.exceptions import ServiceUnavailableException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


@get("/health")
async def health(session: NamedDependency[AsyncSession]) -> dict[str, str]:
    """Liveness plus a database round trip."""
    try:
        await session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise ServiceUnavailableException(detail="database unavailable") from error
    return {"status": "ok"}
