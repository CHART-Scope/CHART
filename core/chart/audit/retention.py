from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from chart.shared.db.models import AuditEventRecord
from chart.shared.db.session import get_session_factory

logger = logging.getLogger(__name__)


def purge_older_than(
    days: int = 30,
    *,
    dry_run: bool = False,
    now: datetime | None = None,
    session_factory=None,
) -> int:
    """Delete audit_event rows whose received_at is older than N days.

    ``now`` is injectable so unit tests can pin the cutoff without touching
    the wall clock.
    """

    session_factory = session_factory or get_session_factory()
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    with session_factory() as session:
        candidates = session.scalar(
            select(func.count(AuditEventRecord.id)).where(
                AuditEventRecord.received_at < cutoff
            )
        )
        candidates = int(candidates or 0)
        if dry_run or candidates == 0:
            return candidates
        session.execute(
            delete(AuditEventRecord).where(AuditEventRecord.received_at < cutoff)
        )
        session.commit()
        return candidates


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="chart-purge-audit-events")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    count = purge_older_than(days=args.days, dry_run=args.dry_run)
    logger.info(
        "audit_event purge: matched=%d days=%d dry_run=%s",
        count,
        args.days,
        args.dry_run,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
