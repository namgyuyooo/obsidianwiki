FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    rclone \
    tini \
    unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/wiki-repo

COPY . /workspace/wiki-repo

ENV WIKI_OPS_REPO_ROOT=/workspace/wiki-repo \
    WIKI_API_HOST=0.0.0.0 \
    WIKI_API_PORT=8787 \
    DRIVE_WIKIFY_ENV=/config/drive_wikify.env \
    DRIVE_WIKIFY_RUNTIME=/data/drive_wikify/runtime \
    WIKI_API_RUNTIME=/data/wiki_api/runtime \
    RCLONE_CONFIG=/config/rclone/rclone.conf \
    PYTHONPATH=/workspace/wiki-repo/automation/drive_wikify/src

RUN mkdir -p /config/rclone /data/drive_wikify/runtime /data/wiki_api/runtime

EXPOSE 8787

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "automation/wiki_api/server.mjs"]
