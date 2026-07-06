#!/bin/bash

# Start Celery worker in the background
celery -A app.celery_app worker --loglevel=info --concurrency=2 &

# Start Uvicorn (backend files are already in /app)
uvicorn app.main:app --host 0.0.0.0 --port $PORT