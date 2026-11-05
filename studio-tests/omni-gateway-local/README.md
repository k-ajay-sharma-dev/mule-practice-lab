# Omni Gateway in Local Mode

A small API behind Omni Gateway (formerly Flex Gateway) in Local Mode, in Docker, with a Rate Limiting policy applied from a declarative file.

**This project has not been run.** It was written from the documentation without Docker, a gateway or an Anypoint Platform account. Nothing here has been checked against a live gateway. See [Unconfirmed items](#unconfirmed-items).

## Before you start

Three points decide whether you can run this at all.

- **Registration needs Anypoint Platform.** Local Mode is configured from local files, but the gateway must still be registered. You need an Anypoint Platform organization, plus a connected app, a registration token, or a username and password. A trial organization is enough for the Getting Started tutorial.
- **Windows is not supported.** The Requirements page states: "Omni Gateway isn't supported on Windows or in Docker running on Windows." Use a Linux machine with an x86 processor. The tutorial adds that M1 and M2 processors are not supported. Whether WSL 2 counts as Linux for this purpose is not stated in the docs.
- **Permissions.** You need the Manage Servers and Read Servers permissions in Runtime Manager.

The commands below are for a Linux shell, unlike the PowerShell commands in the main README. They use the `$(pwd)` and `$UID` syntax from the docs.

## What is in this folder

| File | Purpose |
|---|---|
| `conf.d/studio-posts-api.yaml` | The API instance, its upstream and the Rate Limiting policy |
| `.gitignore` | Keeps `registration.yaml` and `certificate.yaml` out of the repository |

Registration writes its files into `conf.d`. They stay out of Git, and you must keep them safe: the docs call them credentials, and without them you can no longer connect the gateway.

No real credentials are stored here. Replace every value in angle brackets on your own machine, and do not commit the result.

## Steps

### 1. Download the image

```bash
docker pull mulesoft/flex-gateway:latest
docker images mulesoft/flex-gateway
```

The product is now called Omni Gateway, but the image, the `flexctl` command and the paths keep the `flex` name.

### 2. Register in Local Mode

Run registration inside `conf.d`, because the start command must run in the same directory.

```bash
cd studio-tests/omni-gateway-local/conf.d
```

**With a connected app.** It needs the scopes Read Servers, Manage Servers and View Organization.

```bash
docker run --entrypoint flexctl \
-v "$(pwd)":/registration -u $UID mulesoft/flex-gateway \
registration create \
--client-id=<your-connected-app-client-id> \
--client-secret=<your-connected-app-client-secret> \
--environment=<your-environment-id> \
--organization=<your-org-id> \
--output-directory=/registration \
studio-local-gw
```

**Or with a token.** In Runtime Manager, select **Omni Gateways**, then **Add Gateway**, to get a registration token. The token is valid for four hours.

```bash
docker run --entrypoint flexctl \
-v "$(pwd)":/registration -u $UID mulesoft/flex-gateway \
registration create \
--token=<your-registration-token> \
--organization=<your-org-id> \
--output-directory=/registration \
studio-local-gw
```

Use `sudo` if you hit file permission issues. In Europe, add `--anypoint-url=https://eu1.anypoint.mulesoft.com`.

Check that `registration.yaml` now exists in `conf.d`. A gateway name cannot be reused, even after a successful registration. A failed run with a duplicate name leaves an empty `registration.yaml`, so delete that file and choose a new name.

### 3. Start the gateway

From the same directory:

```bash
docker run --rm \
-v "$(pwd)":/usr/local/share/mulesoft/flex-gateway/conf.d \
-p 8080:8080 \
mulesoft/flex-gateway
```

The logs should include this line:

```
[flex-gateway-envoy][info] all dependencies initialized. starting workers
```

Look for `Adding ApiInstance` and `Adding Policy` lines for `studio-posts-api`. The gateway picks up saved changes to the YAML by itself, so you can edit the file without restarting.

### 4. Call the API

In a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/posts/1
```

The route `/api(/.*)` sends the captured part upstream, so `/api/posts/1` reaches `https://jsonplaceholder.typicode.com/posts/1`.

### 5. Trip the rate limit

The policy allows three requests every six seconds.

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/posts/1; done
curl -si http://localhost:8080/api/posts/1 | grep -i x-ratelimit
```

**What the docs lead you to expect**

- `200` for the first three requests, then `429` until the window ends.
- With `exposeHeaders: true`, the headers `X-Ratelimit-Remaining`, `X-Ratelimit-Limit` and `X-Ratelimit-Reset`.
- The quota applies to every request, because there is no `keySelector`.

### 6. Stop the gateway

Press Ctrl+C in the gateway terminal, or find the container with `docker ps` and run `docker stop <container id>`.

## Optional: Basic Authentication instead

Add this entry under `spec.policies` in `conf.d/studio-posts-api.yaml`, with test values of your own. Do not commit those values.

```yaml
    - policyRef:
        name: http-basic-authentication-flex
      config:
        username: <test-username>
        password: <test-password>
```

Expected: `401` without credentials, and a success with `curl -u <test-username>:<test-password>`. The policy table describes `username` and `password` as base-64 encoded strings, while the docs example shows plain values, so try plain values first and note what works.

## Result

```
Host OS and processor:
Registration method used:
Image tag and gateway version:
Start line seen in the logs?
GET /api/posts/1 status:
Status of each of the 5 rapid requests:
X-Ratelimit headers returned:
YAML edit picked up without a restart?
Basic Authentication: plain or base-64 values?
```

## Unconfirmed items

| Item | Why it is unconfirmed |
|---|---|
| YAML indentation | The docs bundle prints each YAML example on flattened lines, so the structure was rebuilt from the parameter tables |
| Position of `exposeHeaders` and `clusterizable` | Placed under `config`, because the table does not prefix them with `rateLimits`, but the flattened text cannot prove it |
| `keySelector` position | Left out for that reason. Its examples and table do not agree on the level |
| `conf.d` holding both registration and API files | Follows the docs: registration and start run in one directory, and API files go in the directory mounted at start. No page shows the whole layout |
| `latest` image tag | Taken from the docs. The docs list version 1.14 as current, but the tag was not resolved, so note the version you get |
| Public upstream | `jsonplaceholder.typicode.com` is the tutorial's upstream in Connected Mode. Its use here over TLS on port 443 was not tested, and the gateway needs outbound internet access |
| WSL 2 or a Linux virtual machine on Windows | The docs rule out Windows and Docker on Windows, and do not mention either option |
| Behaviour of an unregistered gateway | The docs say you must register and start before configuring API instances. Running without `registration.yaml` was not tested |

## Sources

All from `https://docs.mulesoft.com/gateway/llms-full.txt`, read on 2026-11-05:

- Getting Started with Self-Managed Omni Gateway
- Registering and Running in Local Mode with a Connected App, and with a Token
- Downloading Omni Gateway
- Declarative Configuration Reference Guide
- Secure an API with Basic Authentication and Rate Limiting
- Rate Limiting Policy, and Basic Authentication: Simple Policy
- Requirements and Limits for Omni Gateway
- Troubleshooting Docker Command Issues
