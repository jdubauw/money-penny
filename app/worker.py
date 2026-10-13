"""Run one worker process; database-backed jobs survive app restarts."""
import logging
import time
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from app.ai import categorize_rows
from app.database import Import, Job, Rule, Session, Transaction, init_db, now
from app.importer import CATEGORIES, flag_duplicates, parse

log = logging.getLogger(__name__)


def tx_dict(tx):
    return {"date": tx.date.isoformat(), "description": tx.description, "amount_cents": tx.amount_cents}


def parse_import(import_id):
    with Session() as session:
        item = session.get(Import, import_id)
        if not item or item.status == "committed":
            return {"skipped": True}
        item.status = "processing"
        session.commit()
        try:
            preview = parse(Path(item.path), item.options, item.account_kind)
            dates = [date.fromisoformat(r["date"]) for r in preview["rows"]]
            existing = session.scalars(select(Transaction).where(Transaction.account == item.account,
                Transaction.date >= min(dates), Transaction.date <= max(dates))).all()
            flag_duplicates(preview["rows"], [tx_dict(tx) for tx in existing])
            item.preview = preview
            item.status = "preview"
            item.error = None
            session.commit()
            return {"rows": len(preview["rows"])}
        except Exception:
            session.rollback()
            item = session.get(Import, import_id)
            item.status = "failed"
            # Expected parser messages contain no provider secrets.
            raise


def classify(payload):
    cfg = payload["config"]
    changed = 0
    # Snapshot the requested rows so concurrent uploads cannot extend a job indefinitely.
    ids = payload["ids"]
    for offset in range(0, len(ids), 25):
        with Session() as session:
            rows = session.scalars(select(Transaction).where(Transaction.id.in_(ids[offset:offset + 25]),
                Transaction.category == "Other", Transaction.category_source != "manual",
                Transaction.kind.in_(["purchase", "refund", "fee", "interest"]))).all()
            if not rows:
                continue
            versions = {r.id: r.version for r in rows}
            categories = sorted(set(CATEGORIES + list(session.scalars(select(Transaction.category).distinct())) +
                                    list(session.scalars(select(Rule.category).distinct()))))
            suggestions = categorize_rows(cfg, rows, categories)
            # Refresh under lock; do not overwrite edits made while the model was running.
            session.expire_all()
            for suggestion in suggestions:
                row = session.scalar(select(Transaction).where(Transaction.id == suggestion.id).with_for_update())
                if row and row.version == versions[row.id] and row.category_source != "manual":
                    row.category = suggestion.category
                    row.subcategory = suggestion.subcategory
                    row.explanation = suggestion.explanation
                    row.category_source = f"ai:{cfg['provider']}"
                    row.needs_review = True
                    row.version += 1
                    changed += 1
            session.commit()
    return {"categorized": changed}


def safe_error(exc):
    import httpx
    from pydantic import ValidationError
    if isinstance(exc, httpx.HTTPStatusError):
        return f"AI provider returned HTTP {exc.response.status_code}. Check the model, credentials, and provider logs."
    if isinstance(exc, httpx.RequestError):
        return "Could not reach the AI provider. Check its server URL and network connection."
    if isinstance(exc, ValidationError):
        return "AI output failed validation. No changes from this batch were applied."
    if isinstance(exc, ValueError):
        return str(exc)[:1000]
    return "Processing failed. Check server logs, then retry."


def run_once():
    with Session() as session:
        # Stale jobs are retried after crash; worker holds only short database locks.
        stale = session.scalars(select(Job).where(Job.status == "running", Job.started_at < now() - timedelta(minutes=15))).all()
        for job in stale:
            job.status = "queued"
        session.commit()
        job = session.scalar(select(Job).where(Job.status == "queued").order_by(Job.id).with_for_update(skip_locked=True).limit(1))
        if not job:
            return False
        job.status = "running"
        job.started_at = now()
        session.commit()
        job_id, kind, payload = job.id, job.kind, job.payload
    try:
        result = parse_import(payload["import_id"]) if kind == "import" else classify(payload)
        with Session() as session:
            job = session.get(Job, job_id)
            job.status, job.result = "completed", result
            session.commit()
    except Exception as exc:
        message = safe_error(exc)
        log.error("Job %s failed (%s)", job_id, type(exc).__name__)
        with Session() as session:
            job = session.get(Job, job_id)
            job.status, job.error = "failed", message
            if kind == "import":
                item = session.get(Import, payload["import_id"])
                item.status, item.error = "failed", message
            session.commit()
    return True


def recover_interrupted_jobs():
    # Compose runs exactly one worker. On its restart, no previous job can still run.
    with Session() as session:
        for job in session.scalars(select(Job).where(Job.status == "running")):
            job.status = "queued"
        session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()
    recover_interrupted_jobs()
    while True:
        if not run_once():
            time.sleep(2)
