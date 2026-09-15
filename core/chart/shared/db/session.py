from __future__ import annotations

import os
import threading

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_engine_lock = threading.RLock()
_engines: dict[str, Engine] = {}
_session_factories: dict[str, sessionmaker[Session]] = {}


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def get_engine(database_url_value: str | None = None) -> Engine:
    url = database_url_value or database_url()
    with _engine_lock:
        engine = _engines.get(url)
        if engine is None:
            options: dict[str, object] = {
                "future": True,
                "pool_pre_ping": True,
            }
            if not url.startswith("sqlite"):
                options.update(
                    {
                        "pool_size": int(os.getenv("DATABASE_POOL_SIZE", "10")),
                        "max_overflow": int(os.getenv("DATABASE_MAX_OVERFLOW", "10")),
                        "pool_timeout": int(
                            os.getenv("DATABASE_POOL_TIMEOUT_SECONDS", "15")
                        ),
                        "pool_recycle": int(
                            os.getenv("DATABASE_POOL_RECYCLE_SECONDS", "1800")
                        ),
                    }
                )
            engine = create_engine(url, **options)
            _engines[url] = engine
        return engine


def get_session_factory(
    database_url_value: str | None = None,
) -> sessionmaker[Session]:
    url = database_url_value or database_url()
    with _engine_lock:
        factory = _session_factories.get(url)
        if factory is None:
            factory = sessionmaker(
                bind=get_engine(url),
                autoflush=False,
                expire_on_commit=False,
            )
            _session_factories[url] = factory
        return factory


def dispose_engines() -> None:
    """Dispose all process-scoped pools during application shutdown."""

    with _engine_lock:
        for engine in _engines.values():
            engine.dispose()
        _engines.clear()
        _session_factories.clear()
