FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY backend/ .

# Copy and prepare the start script
COPY start.sh .
RUN chmod +x start.sh

ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

# Execute the start script
CMD ["./start.sh"]