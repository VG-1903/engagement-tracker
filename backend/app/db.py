from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_db() -> Iterator[Session]:
    """One session per request. Services decide transaction boundaries via `transaction()`."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()  # rolls back anything left uncommitted


@contextmanager
def transaction(db: Session) -> Iterator[Session]:
    """Unit of work: commit if the block succeeds, roll back everything if anything raises."""
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
