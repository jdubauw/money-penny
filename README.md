# Spending Ledger

A private, single-user web application for uploading bank exports, reviewing transaction categories, and exploring spending. Runs on your home Coolify server with PostgreSQL and a background worker. AI can use your local Ollama server or an OpenAI API key. It also works with merchant rules alone.

## What works

- Multi-file uploads for one account with per-file progress, independent errors, and failed-only retries. Each CSV/PDF retains its own preview and reconciliation; the 25 MB limit applies per file.
- CSV uploads with automatic header detection, explicit column mapping, configurable date format, expenses-positive/negative convention, and separate Debit/Credit columns.
- Text-based Chase credit-card PDFs matching the statements in this project. Purchases, payments/credits, fees, and interest are reconciled against statement totals.
- Import previews with row selection, possible-duplicate flags, original-file downloads, and explicit acknowledgement of reconciliation warnings. Reports include only committed rows.
- Repeat-file detection per account. Overlap checks compare date, original description, and exact amount as a multiset; legitimate repeated purchases within an export remain separate. Candidates are suggestions, not automatic deletions.
- Monthly, quarterly, yearly, and available prior-year summaries with account/period selectors, six-period spending history, comparisons, sortable category amounts and percentages, and an interactive donut. Category/merchant drill-down and CSV downloads preserve the selected account and calendar range.
- Dedicated Vendor Analysis with date/account/category/search filters, sortable purchase metrics, optional account/category breakdown, transaction drill-down, and CSV export. Net spend includes refunds; purchase averages exclude refunds and fees.
- Savings Opportunities with recurring-charge suggestions, manually added monthly/annual services, saved Keep/Review/Cancel decisions, editable category reduction targets, and CSV export. Only confirmed cancellations count toward subscription savings. Confirmed services are excluded from category targets. Category baselines annualize spending using months with imported transactions; missing and partial statements can distort estimates. Saved service decisions apply globally across accounts and periods.
- Date/account/category/type/merchant/amount filters in the ledger, review queue, bulk corrections, merchant rules, correction history, and CSV export.
- AI categorization of unknown spending merchants, and natural-language questions translated into proposed filters for your approval. SQL/database logic calculates totals.
- Signed, expiring HTTP-only sessions, password-change session invalidation, login throttling, same-origin mutation checks, and server-side AI credentials.

The frontend lives in `frontend/`: **React + TypeScript**, **Vite**, **Tailwind CSS v4**, **shadcn/ui** (Radix components), **TanStack Router**, **TanStack Query**, and **TanStack Charts**. Components, typed API calls, query caching, and mutations replace the original static DOM scripts. Routing uses URL hashes so refreshing a page needs no extra reverse-proxy routes.

The Dockerfile uses a Node build stage to compile the frontend and copies only the resulting assets into the Python image. FastAPI serves those assets and the API from the same origin. No Node server, CDN, or third-party font service is needed in production. The existing Coolify Compose configuration still works unchanged.

## Deploy on Coolify

1. Put the application source in a **private Git repository** accessible to Coolify. The `.gitignore` excludes `input/`, `outputs/`, extracted private transaction JSON, local data, and `.env`. Review the files before publishing; the existing report-builder scripts contain household-specific merchant rules.
2. Create a Git-based application, choose the **Docker Compose** build strategy, set Base Directory to `/`, and Compose Location to `/compose.yaml`.
3. Configure the environment variables below. Use long random credentials. A hex password avoids special characters in the database connection URL. Generate separate secrets with `python -c 'import secrets; print(secrets.token_hex(32))'`.
4. Assign your domain to the **web** service at internal port **3005**, for example `https://spending.example.com:3005`. Set `APP_ORIGIN=https://spending.example.com` without the port suffix used for Coolify routing. Keep `COOKIE_SECURE=true` for HTTPS.
5. Deploy and check the web service's `/health` endpoint and worker logs. Sign in with `APP_USERNAME` and `APP_PASSWORD`, upload an export, and approve its preview.

| Variable | Purpose |
| --- | --- |
| `APP_USERNAME` | Login name; defaults to `admin` |
| `APP_PASSWORD` | Required; at least 12 characters |
| `SESSION_SECRET` | Required; random string of at least 32 characters |
| `POSTGRES_PASSWORD` | Required; random URL-safe database password |
| `APP_ORIGIN` | Required; exact browser origin, such as `https://spending.example.com` |
| `COOKIE_SECURE` | `true` for HTTPS; `false` only for a local HTTP preview |
| `AI_PROVIDER` | Initial provider: `none`, `ollama`, or `openai` |
| `OLLAMA_BASE_URL` | Server reachable from both app containers |
| `OLLAMA_MODEL` | Installed model name, also editable in the app |
| `OPENAI_API_KEY` | Your API key; stored only in server environment variables |
| `OPENAI_MODEL` | A model your account can use that supports structured outputs |
| `OPENAI_BASE_URL` | Defaults to `https://api.openai.com/v1` |

AI provider and model changes saved in the app take precedence over their initial environment defaults. Changing a server URL or key requires a redeploy of both `web` and `worker`. There is no automatic fallback to another provider.

The Compose services expose no host ports by default. Only route the web service through Coolify. PostgreSQL and the worker stay internal. Persistent volumes `database` and `statements` hold the database and uploads respectively. Do not remove these volumes on redeployment. Bind mounts, if used instead, must be writable by UID **10001**.

Official deployment reference: [Coolify Docker Compose](https://coolify.io/docs/applications/builds/docker-compose).

## Ollama on your home network

Use an existing Ollama installation and pull your chosen model there. Set `OLLAMA_BASE_URL` to a server address reachable **inside the containers**:

- Ollama on the Coolify host: `http://host.docker.internal:11434` (the Compose file supplies the Linux host-gateway mapping).
- Ollama on another home machine: `http://YOUR-LAN-IP:11434`.
- Ollama in another container: use its service name on a shared Docker network, or a reachable host address.

Ollama's listener must accept connections from the application network; a listener bound only to `127.0.0.1` will not accept connections from containers. Configure its `OLLAMA_HOST` as appropriate, restrict access to your private network, and keep the Ollama port off the public internet. GPU setup and model downloads belong to your Ollama installation, not this app.

In **AI & rules**, choose Ollama, enter the installed model name, save, then select **Test saved provider**. Model quality and performance depend on the model and your hardware. Local structured output uses [Ollama's chat API](https://docs.ollama.com/api/chat).

## OpenAI

Set `OPENAI_API_KEY` in Coolify and select a supported model in **AI & rules**. The key is never included in browser responses or job payloads. Categorization sends only transaction IDs, merchant descriptions, normalized merchants, and category names. It does not send statement documents, account names, dates, or amounts. The merchant description itself may contain identifying information from a bank export.

Natural-language filtering sends your question, current date, and available account/category names. Responses are validated before use; proposed filters are displayed before you apply them. Requests set `store=false`; this is not a promise of zero provider retention. See [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

`OPENAI_BASE_URL` can point to another provider only if it implements the **Responses API with strict JSON-schema output**. A Chat-Completions-only “OpenAI-compatible” endpoint is not supported in this version. Keep API-key endpoints on HTTPS.

## Import and accounting behavior

Select multiple statements in the upload picker to queue them for the same account. CSV options apply to every CSV in that selection. One failed upload does not stop the remaining files; use **Retry failed uploads** to resend only failed files. Review and approve each statement separately, in order, so later previews can check overlaps against earlier approvals.

Use a stable account name, such as `Chase 2956`, for all exports from the same account. Uploads are read as untrusted data; no AI is used to extract transaction dates or amounts.

CSV dates support ISO dates plus the selected date format. Amounts use a period as decimal separator and optional comma thousands separators. Specify either Amount or Debit/Credit columns. A recognized Type column can contain `purchase`, `refund`, `payment`, `transfer`, `income`, `fee`, `interest`, or `credit` (`sale` and `return` are also recognized).

Expenses are stored as positive integer cents; refunds and income are negative. Net spending includes purchases, fees, interest, and refunds. Payments, transfers, income, and general credits are excluded. Unclassified credits appear separately so you can identify refunds without treating a credit-card payment as a reduction in spending. Bank transfers with unfamiliar descriptions may need a manual type correction. General retailers and ambiguous processor descriptions need review.

AI suggestions always remain marked for review, even when they choose a category. Manual edits take precedence, and an AI request cannot overwrite a correction made while the model was running. Saving a merchant rule applies that category to future imports from that merchant. Use bulk edits for existing rows.

Reports default to the most recent imported period. Calendar periods with no imported transactions are hatched in history charts, rather than assumed to have zero spending. The comparison average uses only prior periods with imported transactions. Donuts show positive category balances; negative net category credits are listed separately and still reduce net spending. Monthly, quarterly, yearly, and year-end views all include only approved imports. No coverage is assumed for months or accounts you haven't uploaded. The transaction date may precede a statement's posting period. Preview warnings preserve those rows and let you verify the source rather than silently discard them. Duplicate detection is conservative: descriptions or dates that differ between CSV and PDF may need manual checking. If approving overlapping statements at the same time, reopen the second preview after committing the first.

## Local development

Node.js 24+, Python 3.12+, and Poppler (`pdftotext`) are required. For a direct development run, SQLite is used when `DATABASE_URL` is absent; production Compose uses PostgreSQL.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env
```

Fill in `.env`. For an HTTP development preview, set `APP_ORIGIN=http://localhost:3005` and `COOKIE_SECURE=false`. Start the stack with:

```sh
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

For a Python development run, build the frontend once first:

```sh
cd frontend
npm ci
npm run build
cd ..
```

Then export the relevant environment variables in your shell and run these in two terminals:

```sh
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 3005
.venv/bin/python -m app.worker
```

For frontend hot reload, run `npm run dev` from `frontend/` in a third terminal and open `http://localhost:5173/static/`. Set backend `APP_ORIGIN=http://localhost:5173` and `COOKIE_SECURE=false` for this development session. Vite proxies `/api` to FastAPI on port 3005, preserving the HTTP-only session cookie. For testing the compiled UI served by FastAPI, use `APP_ORIGIN=http://localhost:3005` instead.

`npm run build` type-checks and builds the frontend. `npm run format:check` checks the TypeScript, React, and CSS formatting. The checked-in `frontend/components.json` lets you add shadcn components from `frontend/` with `npx shadcn@latest add COMPONENT`.

Build the frontend before running backend tests with `.venv/bin/python -m pytest -q`. Tests create an isolated temporary database and mock the AI providers. The private-PDF reconciliation check runs only when the original `input/` PDFs are present.

The optional `tests/browser-smoke.cjs` runs a full browser workflow against an isolated deployment with the Node `playwright` package and Chromium installed. Supply `TEST_APP_URL`, `APP_USERNAME`, and `APP_PASSWORD` in the environment (or `TEST_ENV_FILE` pointing to a private test `.env`). It creates synthetic transactions and rules; never run it against your production ledger. The companion `tests/browser-batch.cjs` checks batch uploads, partial failures, failed-only retries, duplicate detection, and per-statement approval against the same isolated deployment. It also creates synthetic transactions; do not run it against production. The `tests/browser-reporting.cjs` check covers report frequencies, year-end summaries, category sorting, chart interactions, account isolation, CSV export, and mobile layouts using synthetic data. The main browser smoke test saves screenshots in `outputs/app-preview/` and checks mobile layouts.

Run one worker process. Interrupted jobs are requeued when that worker restarts; completed imports are not committed automatically.

## Start over

In **AI & rules → Reset all data**, open the confirmation dialog, enter your
sign-in password, type `DELETE ALL DATA`, and click **Delete all data permanently**.
This removes all transactions, accounts, statement files, merchant rules, edit
history, processing history, and saved savings plans and targets. Your login and saved AI settings are retained.
Browser CSV mapping preferences are cleared on the device performing the reset.
Wait for queued or running import/AI jobs to finish before resetting. This cannot
be undone from the app; separately created backups are not deleted.

## Backup and restore

For nightly Kopia backups, use the host preparation script in
[`scripts/prepare_backup.py`](scripts/prepare_backup.py). It prepares a single
folder at `/srv/money-penny/backup` containing a validated PostgreSQL dump, all
statement files, and a manifest. Optional configuration capture includes the
Coolify deployment's `.env` and Compose files.

The script briefly stops web and worker for a matching database/files capture,
restarts them, then publishes the completed bundle. Existing named volumes stay
in place. A Kopia essential before-snapshot action runs the script, so failed
preparation fails the backup rather than silently capturing stale data.

See [Kopia setup and restore instructions](docs/kopia-backup.md) for container
identification, installation, nightly scheduling, credentials and restore testing.
This requires installation on your server; deploying the app alone does not
install or configure Kopia.

This first release creates its initial tables automatically. Back up before upgrades; future schema changes require explicit migrations.

## Current limits

Single household login, USD reporting, exact merchant rules, CSV export, and the existing Chase credit-card PDF layout. Scanned PDFs/OCR, generic bank-PDF extraction, multiple users, transaction splits, currency conversion, and budgets are not included. AI classification can be wrong; review its suggestions. CSV export supports further analysis in Excel; the old workbook report scripts remain available separately.
