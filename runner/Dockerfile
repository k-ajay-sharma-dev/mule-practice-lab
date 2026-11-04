# DataWeave runner for Render (free web service) or any Docker host.
# Build context is the repository root:  docker build -f runner/Dockerfile -t dw-runner .
FROM node:22-slim

# Same DataWeave CLI version as the local runner (runner/bin/dw).
ARG DW_VERSION=2.12.3

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Official Linux build from github.com/mulesoft/data-weave-cli. The archive's top folder name is not relied on:
# whatever folder holds bin/dw is moved to /opt/dataweave, then the CLI is smoke-tested so a bad download fails the build.
RUN curl -fsSL -o /tmp/dw.zip \
      "https://github.com/mulesoft/data-weave-cli/releases/download/v${DW_VERSION}/dw-cli-${DW_VERSION}-linux-x86_64.zip" \
 && mkdir -p /tmp/dw && unzip -q /tmp/dw.zip -d /tmp/dw \
 && DW_BIN="$(find /tmp/dw -type f -path '*/bin/dw' | head -n 1)" \
 && test -n "$DW_BIN" \
 && mv "$(dirname "$(dirname "$DW_BIN")")" /opt/dataweave \
 && chmod +x /opt/dataweave/bin/dw \
 && rm -rf /tmp/dw /tmp/dw.zip \
 && /opt/dataweave/bin/dw --version

WORKDIR /app
# .mjs: the server is an ES module and there is no package.json in the image
COPY runner/server.js ./server.mjs

ENV NODE_ENV=production \
    DW_PATH=/opt/dataweave/bin/dw \
    PORT=8787

# run as the unprivileged user that ships with the Node image
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
