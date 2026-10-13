import os
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import Boolean, Date, DateTime, Integer, JSON, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'spending.db'}")
engine = create_engine(DATABASE_URL, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}))
Session = sessionmaker(engine, expire_on_commit=False)


def data_lock(session, exclusive=False):
    # Serialize resets against API requests and worker claims across containers.
    if session.bind.dialect.name == "postgresql":
        function = "pg_advisory_xact_lock" if exclusive else "pg_advisory_xact_lock_shared"
        session.execute(text(f"SELECT {function}(72160413)"))
    elif exclusive and session.bind.dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Import(Base):
    __tablename__ = "imports"
    __table_args__ = (UniqueConstraint("account", "file_hash", name="uq_account_file"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    account: Mapped[str] = mapped_column(String(120), index=True)
    account_kind: Mapped[str] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    preview: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("import_id", "row_index", name="uq_import_row"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(Integer, index=True)
    row_index: Mapped[int] = mapped_column(Integer)
    account: Mapped[str] = mapped_column(String(120), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(Text)
    vendor: Mapped[str] = mapped_column(String(200), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    category: Mapped[str] = mapped_column(String(100), index=True)
    subcategory: Mapped[str] = mapped_column(String(100), default="")
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    category_source: Mapped[str] = mapped_column(String(100), default="builtin")
    explanation: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=1)


class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    vendor: Mapped[str] = mapped_column(String(200), unique=True)
    category: Mapped[str] = mapped_column(String(100))
    subcategory: Mapped[str] = mapped_column(String(100), default="")


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(Integer, index=True)
    before: Mapped[dict] = mapped_column(JSON)
    after: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def init_db():
    Base.metadata.create_all(engine)
