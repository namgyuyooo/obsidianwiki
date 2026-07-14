FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RTM_ENV=production \
    RTM_CUSTOMER_DB=/data/rtm_customer.db \
    RTM_FRONTEND_DIST=/opt/rtm/packages/slack-channel-collector/webapp/frontend/dist \
    RTM_SLACK_GUIDE=/opt/rtm/packages/customer-db/docs/SLACK_MESSAGE_GUIDE.md \
    RTM_SECRET_KEY_FILE=/run/secrets/rtm_secret_key \
    RTM_CORS_ORIGINS="" \
    HOME=/home/rtm

WORKDIR /opt/rtm/packages/slack-channel-collector/webapp/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY collector/src /opt/rtm/packages/slack-channel-collector/src
COPY customer-db/docs /opt/rtm/packages/customer-db/docs
COPY --from=frontend /build/frontend/dist /opt/rtm/packages/slack-channel-collector/webapp/frontend/dist

RUN useradd --create-home --uid 10001 rtm \
    && mkdir -p /data /backups /home/rtm/.npm \
    && chown -R rtm:rtm /data /backups /home/rtm /opt/rtm
USER 10001:10001
EXPOSE 8765
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
