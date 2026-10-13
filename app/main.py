import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.ai import config, plan_filters, public_config, request_json
from app.database import Audit, DATA_DIR, Import, Job, Rule, Session, Setting, Transaction, init_db
from app.importer import CATEGORIES, KINDS, cents, flag_duplicates

STATIC = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[1] / "frontend" / "dist"))
if not STATIC.exists():
    STATIC = Path(__file__).parent / "static"
login_attempts = defaultdict(deque)


@asynccontextmanager
async def lifespan(app):
    if len(os.environ.get("SESSION_SECRET", "")) < 32:
        raise RuntimeError("Set SESSION_SECRET to a random string of at least 32 characters.")
    if len(os.environ.get("APP_PASSWORD", "")) < 12:
        raise RuntimeError("Set APP_PASSWORD to at least 12 characters.")
    init_db()
    yield


app = FastAPI(title="Spending Ledger", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def db():
    with Session() as session:
        yield session


def signer():
    return URLSafeTimedSerializer(os.environ["SESSION_SECRET"], salt="spending-session-v1")


def credential_stamp():
    return hmac.new(os.environ["SESSION_SECRET"].encode(), os.environ["APP_PASSWORD"].encode(), hashlib.sha256).hexdigest()


def auth(request: Request):
    try:
        token = signer().loads(request.cookies.get("session", ""), max_age=43200)
        expected = credential_stamp()
        if token.get("user") != os.environ.get("APP_USERNAME", "admin") or not hmac.compare_digest(token.get("credential", ""), expected):
            raise BadSignature("Invalid session")
    except (BadSignature, SignatureExpired, AttributeError):
        raise HTTPException(401, "Please sign in.")


@app.middleware("http")
async def security(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/login":
        try:
            auth(request)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    if request.method == "POST" and request.url.path == "/api/imports":
        try:
            if int(request.headers.get("content-length", "0")) > 26 * 1024 * 1024:
                return JSONResponse({"detail": "Maximum upload size is 25 MB."}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid request size."}, status_code=400)
    if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        # Custom header cannot be sent by cross-origin forms; no CORS is enabled.
        if request.headers.get("x-requested-with") != "SpendingLedger":
            return JSONResponse({"detail": "Missing request verification header."}, status_code=403)
        origin = request.headers.get("origin")
        expected = os.environ.get("APP_ORIGIN")
        if origin:
            allowed = expected.rstrip("/") if expected else f"{request.url.scheme}://{request.headers.get('host')}"
            if origin.rstrip("/") != allowed:
                return JSONResponse({"detail": "Request origin does not match APP_ORIGIN."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Radix/shadcn dialogs use inline styles for focus and scroll-lock management.
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health(session=Depends(db)):
    session.execute(select(1))
    return {"status": "ok"}


@app.get("/")
def index():
    if not (STATIC / "index.html").exists():
        raise HTTPException(503, "Build the React frontend with npm ci and npm run build in frontend/ first.")
    return FileResponse(STATIC / "index.html")


class Login(BaseModel):
    username: str = Field(max_length=120)
    password: str = Field(max_length=1000)


@app.post("/api/login")
def login(body: Login, request: Request, response: Response):
    # Do not trust caller-controlled forwarded headers for rate limiting.
    host = request.client.host if request.client else "unknown"
    attempts = login_attempts[host]
    current = time.monotonic()
    while attempts and attempts[0] < current - 300:
        attempts.popleft()
    if len(attempts) >= 10:
        raise HTTPException(429, "Too many sign-in attempts. Try again in five minutes.")
    attempts.append(current)
    valid_user = hmac.compare_digest(body.username.encode(), os.environ.get("APP_USERNAME", "admin").encode())
    valid_password = hmac.compare_digest(hashlib.sha256(body.password.encode()).digest(), hashlib.sha256(os.environ["APP_PASSWORD"].encode()).digest())
    if not valid_user or not valid_password:
        raise HTTPException(401, "Incorrect username or password.")
    attempts.clear()
    token = signer().dumps({"user": body.username, "credential": credential_stamp()})
    response.set_cookie("session", token, httponly=True, secure=os.environ.get("COOKIE_SECURE", "true") == "true", samesite="strict", max_age=43200)
    return {"ok": True}


@app.post("/api/logout", dependencies=[Depends(auth)])
def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}


@app.get("/api/bootstrap", dependencies=[Depends(auth)])
def bootstrap(session=Depends(db)):
    categories = sorted(set(CATEGORIES + list(session.scalars(select(Transaction.category).distinct())) + list(session.scalars(select(Rule.category).distinct()))))
    return {"categories": categories, "kinds": KINDS, "accounts": list(session.scalars(select(Import.account).distinct().order_by(Import.account))),
            "ai": public_config(session)}


def import_dict(item):
    return {"id": item.id, "account": item.account, "account_kind": item.account_kind, "filename": item.filename,
            "status": item.status, "error": item.error, "created_at": item.created_at.isoformat(),
            "row_count": len(item.preview.get("rows", [])), "warnings": item.preview.get("warnings", [])}


@app.get("/api/imports", dependencies=[Depends(auth)])
def imports(session=Depends(db)):
    return [import_dict(item) for item in session.scalars(select(Import).order_by(Import.id.desc()))]


@app.post("/api/imports", dependencies=[Depends(auth)])
async def upload(file: UploadFile = File(...), account: str = Form(...), account_kind: str = Form("credit"),
                 options: str = Form("{}"), session=Depends(db)):
    account = account.strip()
    if not account or len(account) > 120 or account_kind not in ["credit", "checking"]:
        raise HTTPException(422, "Choose an account name and a supported account type.")
    previous = session.scalar(select(Import).where(Import.account == account).limit(1))
    if previous and previous.account_kind != account_kind:
        raise HTTPException(422, "This account name already uses a different account type.")
    filename = Path((file.filename or "statement").replace("\\", "/")).name[:255]
    suffix = Path(filename).suffix.lower()
    if suffix not in [".pdf", ".csv"]:
        raise HTTPException(422, "Upload a CSV or PDF file.")
    try:
        opts = json.loads(options)
        if not isinstance(opts, dict):
            raise ValueError()
        if opts.get("date_format", "%m/%d/%Y") not in ["%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y-%m-%d"]:
            raise ValueError()
        if not isinstance(opts.get("negative_expenses", False), bool):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(422, "Invalid CSV options.")
    folder = DATA_DIR / "uploads"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (secrets.token_hex(16) + suffix)
    size = 0
    digest = hashlib.sha256()
    try:
        with path.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 25 * 1024 * 1024:
                    raise HTTPException(413, "Maximum upload size is 25 MB.")
                digest.update(chunk)
                out.write(chunk)
        if not size:
            raise HTTPException(422, "The uploaded file is empty.")
        if suffix == ".pdf" and not path.read_bytes()[:1024].lstrip().startswith(b"%PDF-"):
            raise HTTPException(422, "This file is not a valid PDF.")
        existing = session.scalar(select(Import).where(Import.account == account, Import.file_hash == digest.hexdigest()).with_for_update())
        if existing:
            if existing.status != "failed":
                path.unlink()
                return {**import_dict(existing), "already_uploaded": True}
            existing.path, existing.options, existing.status, existing.error = str(path), opts, "queued", None
            session.add(Job(kind="import", payload={"import_id": existing.id}))
            session.commit()
            return import_dict(existing)
        item = Import(account=account, account_kind=account_kind, filename=filename, path=str(path), file_hash=digest.hexdigest(), options=opts)
        session.add(item)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            existing = session.scalar(select(Import).where(Import.account == account, Import.file_hash == digest.hexdigest()))
            if existing:
                path.unlink()
                return {**import_dict(existing), "already_uploaded": True}
            raise
        session.add(Job(kind="import", payload={"import_id": item.id}))
        session.commit()
        return import_dict(item)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@app.get("/api/imports/{item_id}", dependencies=[Depends(auth)])
def preview(item_id: int, session=Depends(db)):
    item = session.get(Import, item_id)
    if not item:
        raise HTTPException(404, "Import not found.")
    if item.status == "preview":
        # Refresh overlap checks after other imports have been committed.
        existing = session.scalars(select(Transaction).where(Transaction.account == item.account)).all()
        preview_data = dict(item.preview)
        flag_duplicates(preview_data["rows"], [{"date": r.date.isoformat(), "description": r.description, "amount_cents": r.amount_cents} for r in existing])
        item.preview = preview_data
        session.commit()
    return {**import_dict(item), "preview": item.preview}


@app.get("/api/imports/{item_id}/file", dependencies=[Depends(auth)])
def original(item_id: int, session=Depends(db)):
    item = session.get(Import, item_id)
    if not item:
        raise HTTPException(404, "Import not found.")
    return FileResponse(item.path, filename=item.filename, media_type="application/octet-stream")


class Commit(BaseModel):
    selected_indices: list[int] = Field(max_length=25000)
    acknowledge_warnings: bool = False


@app.post("/api/imports/{item_id}/commit", dependencies=[Depends(auth)])
def commit(item_id: int, body: Commit, session=Depends(db)):
    item = session.scalar(select(Import).where(Import.id == item_id).with_for_update())
    if not item or item.status != "preview":
        raise HTTPException(409, "Only a preview import can be committed.")
    rows = item.preview["rows"]
    selected = body.selected_indices
    if not selected or len(selected) != len(set(selected)) or any(i < 0 or i >= len(rows) for i in selected):
        raise HTTPException(422, "Select valid transaction rows, each only once.")
    if item.preview.get("warnings") and not body.acknowledge_warnings:
        raise HTTPException(422, "Review and acknowledge the reconciliation warnings first.")
    rules = {r.vendor.casefold(): r for r in session.scalars(select(Rule))}
    for i in selected:
        row = dict(rows[i])
        row.pop("duplicate_candidate", None)
        row["date"] = date.fromisoformat(row["date"])
        rule = rules.get(row["vendor"].casefold())
        if rule and row["kind"] in ["purchase", "refund", "fee", "interest"]:
            row.update(category=rule.category, subcategory=rule.subcategory, category_source="merchant_rule", needs_review=False)
        session.add(Transaction(import_id=item.id, row_index=i, account=item.account, **row))
    item.status = "committed"
    item.preview = {**item.preview, "committed_rows": len(selected)}
    session.commit()
    return {"imported": len(selected)}


def filtered(session, start=None, end=None, search=None, category=None, account=None, kind=None, review=False, min_amount=None, max_amount=None, vendor=None):
    query = select(Transaction)
    if start:
        query = query.where(Transaction.date >= start)
    if end:
        query = query.where(Transaction.date <= end)
    if search:
        # Escape LIKE wildcard characters so search means literal substring.
        term = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(Transaction.description.ilike(term, escape="\\") | Transaction.vendor.ilike(term, escape="\\"))
    if category:
        query = query.where(Transaction.category == category)
    if account:
        query = query.where(Transaction.account == account)
    if vendor:
        query = query.where(Transaction.vendor == vendor)
    if kind:
        if kind not in KINDS:
            raise HTTPException(422, "Unsupported transaction type.")
        query = query.where(Transaction.kind == kind)
    if review:
        query = query.where(Transaction.needs_review.is_(True))
    if min_amount is not None:
        query = query.where(Transaction.amount_cents >= cents(str(min_amount)))
    if max_amount is not None:
        query = query.where(Transaction.amount_cents <= cents(str(max_amount)))
    return query


def filter_params(start: date | None = None, end: date | None = None, search: str | None = Query(None, max_length=200),
                  category: str | None = None, account: str | None = None, kind: str | None = None,
                  review: bool = False, min_amount: str | None = None, max_amount: str | None = None,
                  vendor: str | None = Query(None, max_length=200)):
    if start and end and start > end:
        raise HTTPException(422, "Start date must precede end date.")
    try:
        if min_amount is not None:
            cents(min_amount)
        if max_amount is not None:
            cents(max_amount)
        if min_amount is not None and max_amount is not None and cents(min_amount) > cents(max_amount):
            raise ValueError("Minimum amount must not exceed maximum amount.")
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return dict(start=start, end=end, search=search, category=category, account=account, kind=kind, review=review, min_amount=min_amount, max_amount=max_amount, vendor=vendor)


def transaction_dict(row):
    return {"id": row.id, "import_id": row.import_id, "account": row.account, "date": row.date.isoformat(),
            "description": row.description, "vendor": row.vendor, "amount_cents": row.amount_cents,
            "kind": row.kind, "category": row.category, "subcategory": row.subcategory, "needs_review": row.needs_review,
            "category_source": row.category_source, "explanation": row.explanation, "version": row.version}


@app.get("/api/transactions", dependencies=[Depends(auth)])
def transactions(filters=Depends(filter_params), page: int = Query(1, ge=1), session=Depends(db)):
    query = filtered(session, **filters)
    count = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(query.order_by(Transaction.date.desc(), Transaction.id.desc()).offset((page - 1) * 100).limit(100))
    return {"rows": [transaction_dict(r) for r in rows], "count": count, "page": page, "pages": (count + 99) // 100}


@app.get("/api/reports", dependencies=[Depends(auth)])
def reports(filters=Depends(filter_params), session=Depends(db)):
    rows = session.scalars(filtered(session, **filters)).all()
    categories, months, vendors = defaultdict(int), defaultdict(int), defaultdict(int)
    spend = 0
    income = 0
    other_credits = 0
    for row in rows:
        if row.kind in ["purchase", "refund", "fee", "interest"]:
            spend += row.amount_cents
            categories[row.category] += row.amount_cents
            months[row.date.strftime("%Y-%m")] += row.amount_cents
            vendors[row.vendor] += row.amount_cents
        elif row.kind == "income":
            income -= row.amount_cents
        elif row.kind == "credit":
            other_credits += row.amount_cents
    committed = session.scalars(select(Import).where(Import.status == "committed")).all()
    if filters.get("account"):
        committed = [i for i in committed if i.account == filters["account"]]
    ranges = [{"account": i.account, "filename": i.filename, "start": i.preview.get("summary", {}).get("opening_date"),
               "end": i.preview.get("summary", {}).get("closing_date")} for i in committed]
    return {"spend_cents": spend, "income_cents": income, "unclassified_credit_cents": other_credits,
            "count": len(rows), "review_count": sum(r.needs_review for r in rows),
            "categories": sorted(categories.items(), key=lambda p: p[1], reverse=True),
            "months": sorted(months.items()), "vendors": sorted(vendors.items(), key=lambda p: p[1], reverse=True)[:12],
            "date_start": min((r.date for r in rows), default=None), "date_end": max((r.date for r in rows), default=None),
            "statement_ranges": ranges}


class Edit(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=100)
    subcategory: str = Field(default="", max_length=100)
    kind: str | None = None
    save_rule: bool = False


@app.patch("/api/transactions", dependencies=[Depends(auth)])
def edit(body: Edit, session=Depends(db)):
    if body.kind and body.kind not in KINDS:
        raise HTTPException(422, "Unsupported transaction type.")
    rows = session.scalars(select(Transaction).where(Transaction.id.in_(body.ids)).order_by(Transaction.id).with_for_update()).all()
    if len(rows) != len(set(body.ids)):
        raise HTTPException(404, "One or more transactions no longer exist.")
    if body.save_rule and len({r.vendor.casefold() for r in rows}) != 1:
        raise HTTPException(422, "A merchant rule requires transactions from a single merchant.")
    for row in rows:
        before = transaction_dict(row)
        row.category, row.subcategory = body.category.strip(), body.subcategory.strip()
        if not row.category:
            raise HTTPException(422, "Category cannot be blank.")
        if body.kind:
            row.kind = body.kind
        # Normalize credit/debit signs when correcting a transaction's economic type.
        if row.kind in ["refund", "income"]:
            row.amount_cents = -abs(row.amount_cents)
        elif row.kind in ["purchase", "fee", "interest"]:
            row.amount_cents = abs(row.amount_cents)
        row.needs_review, row.category_source, row.explanation = False, "manual", "Reviewed by you"
        row.version += 1
        session.add(Audit(transaction_id=row.id, before=before, after=transaction_dict(row)))
    if body.save_rule:
        vendor = rows[0].vendor
        rule = session.scalar(select(Rule).where(func.lower(Rule.vendor) == vendor.lower()))
        if not rule:
            rule = Rule(vendor=vendor, category=body.category.strip())
            session.add(rule)
        rule.category, rule.subcategory = body.category.strip(), body.subcategory.strip()
    session.commit()
    return {"updated": len(rows)}


@app.get("/api/transactions/{row_id}/history", dependencies=[Depends(auth)])
def history(row_id: int, session=Depends(db)):
    return [{"before": a.before, "after": a.after, "at": a.created_at.isoformat()} for a in session.scalars(select(Audit).where(Audit.transaction_id == row_id).order_by(Audit.id.desc()))]


@app.get("/api/export", dependencies=[Depends(auth)])
def export(filters=Depends(filter_params), session=Depends(db)):
    rows = session.scalars(filtered(session, **filters).order_by(Transaction.date, Transaction.id))
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Date", "Account", "Description", "Merchant", "Amount", "Type", "Category", "Subcategory", "Source import"])
    def cell(value):
        value = str(value)
        return "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value
    for r in rows:
        writer.writerow([r.date.isoformat(), cell(r.account), cell(r.description), cell(r.vendor),
                         f"{r.amount_cents / 100:.2f}", r.kind, cell(r.category), cell(r.subcategory), r.import_id])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="spending.csv"'})


class AISettings(BaseModel):
    provider: str
    ollama_model: str = Field(default="", max_length=150)
    openai_model: str = Field(default="", max_length=150)


@app.put("/api/settings/ai", dependencies=[Depends(auth)])
def save_ai(body: AISettings, session=Depends(db)):
    if body.provider not in ["none", "ollama", "openai"]:
        raise HTTPException(422, "Choose Rules only, Ollama, or OpenAI.")
    setting = session.get(Setting, "ai")
    if not setting:
        setting = Setting(key="ai", value={})
        session.add(setting)
    setting.value = body.model_dump()
    session.commit()
    return public_config(session)


@app.post("/api/ai/test", dependencies=[Depends(auth)])
def test_ai(session=Depends(db)):
    from app.worker import safe_error
    try:
        result = request_json(config(session), {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False},
                              "Return ok=true.", {"test": True})
        if result != {"ok": True}:
            raise ValueError("Provider responded but did not follow the test schema.")
    except Exception as exc:
        raise HTTPException(422, safe_error(exc))
    return {"ok": True}


@app.post("/api/ai/categorize", dependencies=[Depends(auth)])
def queue_ai(session=Depends(db)):
    cfg = config(session)
    if cfg["provider"] == "none":
        raise HTTPException(422, "Choose an AI provider in settings first.")
    active = session.scalar(select(Job).where(Job.kind == "categorize", Job.status.in_(["queued", "running"])))
    if active:
        return {"job_id": active.id, "already_running": True}
    ids = list(session.scalars(select(Transaction.id).where(Transaction.category == "Other", Transaction.category_source != "manual",
        Transaction.kind.in_(["purchase", "refund", "fee", "interest"]))))
    if not ids:
        return {"job_id": None, "count": 0}
    job = Job(kind="categorize", payload={"config": cfg, "ids": ids})
    session.add(job)
    session.commit()
    return {"job_id": job.id, "count": len(ids)}


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=1000)


@app.post("/api/ai/filter", dependencies=[Depends(auth)])
def ai_filter(body: Question, session=Depends(db)):
    from app.worker import safe_error
    try:
        categories = sorted(set(CATEGORIES + list(session.scalars(select(Transaction.category).distinct()))))
        accounts = list(session.scalars(select(Transaction.account).distinct()))
        return plan_filters(config(session), body.question, categories, accounts)
    except Exception as exc:
        raise HTTPException(422, safe_error(exc))


@app.get("/api/jobs", dependencies=[Depends(auth)])
def jobs(session=Depends(db)):
    return [{"id": j.id, "kind": j.kind, "status": j.status, "result": j.result, "error": j.error}
            for j in session.scalars(select(Job).order_by(Job.id.desc()).limit(20))]


@app.get("/api/rules", dependencies=[Depends(auth)])
def rules(session=Depends(db)):
    return [{"id": r.id, "vendor": r.vendor, "category": r.category, "subcategory": r.subcategory} for r in session.scalars(select(Rule).order_by(Rule.vendor))]


@app.delete("/api/rules/{rule_id}", dependencies=[Depends(auth)])
def remove_rule(rule_id: int, session=Depends(db)):
    rule = session.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found.")
    session.delete(rule)
    session.commit()
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC, check_dir=False), name="static")
