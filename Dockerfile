FROM node:20-slim AS frontend-build
WORKDIR /app
# Dependency layer first so source edits don't re-download the npm tree.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
COPY backend/static/ ./backend/static/
# Tailwind v4 scans backend/templates/**/*.html via `@source` in globals.css —
# without these, classes used only in Jinja templates get purged from the bundle.
COPY backend/templates/ ./backend/templates/
RUN cd frontend && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY content/ ./content/
COPY --from=frontend-build /app/backend/static/ ./backend/static/
RUN mkdir -p /app/data
EXPOSE 8000
WORKDIR /app/backend
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/en/', timeout=4)"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
