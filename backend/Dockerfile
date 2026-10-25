FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Optional toolchains for the multi-language code runner (python + node are the tested ones).
RUN apt-get update && apt-get install -y --no-install-recommends nodejs g++ golang-go && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# Run as an unprivileged user: submitted code executes inside this container.
RUN useradd -m agama && chown -R agama /app
USER agama
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
