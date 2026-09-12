# r2dfiifbj5 — one image that runs Vernon Project and nothing else.
#
# Deliberately absent: nginx and MariaDB. Both are the operator's, reached over
# their own network. The image therefore serves its own static files (see
# wsgi.py) because an nginx on another device cannot read this filesystem.
#
# Pinned to what the live bench actually runs: Frappe 15.100.1, Python 3.11,
# Node 20. Nothing secret is baked in — no ARG or ENV here carries a credential;
# the deployment's values arrive at run time from deploy/.env via env_file.

FROM python:3.11-slim-bookworm

ARG FRAPPE_BRANCH=version-15
ARG NODE_MAJOR=20

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    BENCH_PATH=/home/frappe/frappe-bench

RUN apt-get update && apt-get install --no-install-recommends -y \
      build-essential ca-certificates curl git \
      libmariadb-dev pkg-config \
      mariadb-client \
      redis-tools \
      wkhtmltopdf \
      gettext-base \
    && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install --no-install-recommends -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Everything below runs as a normal user; the container never needs root.
RUN useradd -ms /bin/bash frappe
USER frappe
WORKDIR /home/frappe

RUN pip install --user --no-cache-dir frappe-bench
ENV PATH=/home/frappe/.local/bin:$PATH

RUN bench init --skip-redis-config-generation --frappe-branch ${FRAPPE_BRANCH} \
      --python python3 frappe-bench
WORKDIR ${BENCH_PATH}

# The app comes from the build context, not a clone: the repository is private,
# and "copy this folder to any device" has to work without git credentials.
COPY --chown=frappe:frappe . apps/vernon_project
RUN bench pip install -e apps/vernon_project \
    && echo "vernon_project" >> sites/apps.txt \
    && bench build --app frappe --app vernon_project

COPY --chown=frappe:frappe deploy/wsgi.py deploy/entrypoint.sh ${BENCH_PATH}/
RUN chmod +x ${BENCH_PATH}/entrypoint.sh

EXPOSE 8000 9000
ENTRYPOINT ["/home/frappe/frappe-bench/entrypoint.sh"]
CMD ["web"]
