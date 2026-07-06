#!/bin/bash

# Start Celery worker in the background
celery -A app.celery_app worker --loglevel=info --concurrency=2 &

# Start the Uvicorn server (this will run in the foreground)
cd backend
uvicorn app.main:app --host 0.0.0.0 --port $PORT