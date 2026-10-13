FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data TZ=America/Chicago
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tzdata && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts/process_statements.py ./scripts/process_statements.py
COPY --from=frontend /frontend/dist ./app/static
RUN useradd --create-home --uid 10001 ledger && mkdir -p /data && chown ledger:ledger /data
USER ledger
EXPOSE 3005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3005", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
