"""SQLAlchemy async engine + session factory with SQLite WAL mode."""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import event
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)


# Enable WAL mode and busy timeout for SQLite to handle concurrent access
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if hasattr(dbapi_connection, "cursor"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")  # 30 second busy timeout for high contention
        cursor.close()


async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_with_retry() -> AsyncSession:
    """Like get_db but retries on SQLite database-locked errors."""
    import asyncio
    import sqlite3
    last_error = None
    for attempt in range(5):
        session = async_session()
        try:
            async with session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
            return
        except sqlite3.OperationalError as e:
            last_error = e
            if "database is locked" in str(e) and attempt < 4:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables (MVP: use SQLAlchemy create_all)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
