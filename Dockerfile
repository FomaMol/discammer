FROM node:20-slim AS frontend-build
WORKDIR /app
COPY frontend/ ./frontend/
COPY backend/static/ ./backend/static/
RUN cd frontend && npm ci && npm run build

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
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
