# backend/app/celery_app.py
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

# Initialize Celery app
celery_app = Celery(
    "aeroml_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.gradient_optimizer",
        "app.tasks.pareto",
        "app.tasks.openfoam_task",
        "app.tasks.expiry_emails",
    ],
)

# Configuration settings for robustness
celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)

# ─── BEAT SCHEDULE FOR EXPIRY EMAILS ────────────────────────────

celery_app.conf.beat_schedule = {
    'check-expiring-trials': {
        'task': 'check_expiring_trials',
        'schedule': crontab(minute='*/15'),  # Every 15 minutes
        'args': (),
    },
    'check-expiring-subscriptions': {
        'task': 'check_expiring_subscriptions',
        'schedule': crontab(hour='*/2', minute='0'),  # Every 2 hours
        'args': (),
    },
    'check-expired-subscriptions': {
        'task': 'check_expired_subscriptions',
        'schedule': crontab(hour='*/1', minute='30'),  # Every hour at :30
        'args': (),
    },
}

if __name__ == "__main__":
    celery_app.start()