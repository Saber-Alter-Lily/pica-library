# Experimental Server / Docker preview deployment

Status: **operator preview only**. This is an authenticated Remote API deployment
shape, not a remotely hosted Pica Library Web UI and not a formal release
channel.

## What this bundle does

The reference Compose topology is:

```text
Internet / authorized API client
        |
      HTTPS
        |
      Caddy
        |
 internal pica_backend network
        |
 Pica Remote API :8787
        |
 loopback-only application engine

Pica -> pica_egress -> Provider / WebDAV / GitHub as needed
Caddy -> caddy_egress -> ACME / certificate services
```

Only Caddy publishes host ports. The Pica container does **not** publish
`8787`, the ordinary Desktop controller remains loopback-only inside the Pica
container, and the Remote API continues to expose only the explicit
library/reader allowlist.

The main Pica process runs as UID/GID `10001:10001`, drops all Linux
capabilities, uses `no-new-privileges`, and has a read-only application
filesystem. Mutable application state lives in the named `pica_config` volume.

## Why there is a one-shot init service

Docker Compose file-backed secrets are mounted as files, but local Compose does
not reliably remap `uid`, `gid` and `mode` for a secret whose source is a
host file. Pica's Remote API intentionally rejects group/world-readable bearer
tokens.

The `pica-init` service therefore runs once as root with networking disabled.
It:

1. reads the Compose secret;
2. initializes ownership of the persistent config volume;
3. copies the bearer token into a private named volume;
4. sets the runtime copy to `0600` owned by `10001:10001`;
5. exits.

The long-running Pica service then mounts only that private secret volume
read-only and remains non-root. The bearer token is never supplied as a Pica
service environment variable.

## Prerequisites

- Docker Engine with Docker Compose v2;
- the experimental Pica Docker amd64 image already loaded locally;
- a real DNS hostname pointing to this server for ordinary deployment;
- TCP 80 and TCP/UDP 443 reachable by Caddy when public automatic HTTPS is
  expected;
- a strong bearer token stored in a local file.

The current CI artifact is not a registry release. Set
`PICA_LIBRARY_IMAGE` to the exact image tag produced by the artifact you
loaded. When a registry preview exists later, use an immutable digest rather
than a floating tag.

## Prepare the bearer token

From the directory that contains the Compose bundle:

```bash
mkdir -p secrets
umask 077
openssl rand -hex 32 > secrets/remote-api-token
chmod 0600 secrets/remote-api-token
```

Do not commit this file. Do not put the bearer token into
`PICA_LIBRARY_REMOTE_*` environment variables other than the path to the
runtime secret file already defined by the Compose file.

## Start

Set the immutable/local image reference and hostname:

```bash
export PICA_LIBRARY_IMAGE='pica-library:0.4.11-<source>-docker-amd64-experimental'
export PICA_LIBRARY_DOMAIN='library.example.com'

docker compose -f packaging/docker/server-preview/compose.yaml config
docker compose -f packaging/docker/server-preview/compose.yaml up -d
docker compose -f packaging/docker/server-preview/compose.yaml ps
```

Caddy's normal configuration uses the hostname in
`packaging/docker/server-preview/Caddyfile`. With public DNS and reachable
ports, Caddy obtains and renews the HTTPS certificate. CI uses a separate
`tls internal` Caddyfile only for isolated certificate-validation tests.

Public health is intentionally minimal:

```bash
curl https://"$PICA_LIBRARY_DOMAIN"/healthz
```

An API call needs the bearer token:

```bash
TOKEN="$(cat secrets/remote-api-token)"
curl   -H "Authorization: Bearer $TOKEN"   "https://$PICA_LIBRARY_DOMAIN/api/v1/capabilities"
unset TOKEN
```

A browser request carrying an `Origin` header is rejected unless an origin is
explicitly configured. The preview intentionally leaves browser origins
disabled because W5 Remote Web/PWA has a separate authentication/session
design.

## Verify the security boundary

Check that Pica has no published port:

```bash
docker compose -f packaging/docker/server-preview/compose.yaml port pica 8787
```

No host mapping should be returned. Caddy should be the only service publishing
80/443.

Check the private runtime bearer copy:

```bash
docker compose -f packaging/docker/server-preview/compose.yaml exec pica   /opt/pica/runtime/bin/node -e   "const fs=require('fs');const s=fs.statSync('/run/pica-secret/token');console.log((s.mode&0o777).toString(8),s.uid,s.gid)"
```

Expected: `600 10001 10001`.

## Back up before changing the image

The image and the mutable `/config` volume are separate recovery units. Stop
writers before taking a snapshot:

```bash
COMPOSE='docker compose -f packaging/docker/server-preview/compose.yaml'
mkdir -p backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

$COMPOSE stop caddy pica
$COMPOSE run --rm --no-deps   --user 0:0   --entrypoint /bin/sh   -v "$PWD/backups:/backup"   pica-init   -c "set -eu; tar -C /config -czf /backup/pica-config-$STAMP.tar.gz ."
$COMPOSE start pica caddy
```

Keep the previous exact image tag/digest together with that snapshot. Never use
`docker compose down -v` during an upgrade or rollback; `-v` deletes the
named data volumes.

## Promote a newer preview image

1. Load/pull and verify the candidate image.
2. Record the current exact `PICA_LIBRARY_IMAGE`.
3. Take the stopped-volume snapshot above.
4. Set `PICA_LIBRARY_IMAGE` to the candidate.
5. Recreate the init, Pica and Caddy services.
6. Require Pica to become healthy and verify HTTPS `/healthz` plus an
   authenticated `/api/v1/capabilities` request.
7. Keep the old image and snapshot until the candidate has been accepted.

Example:

```bash
OLD_IMAGE="$PICA_LIBRARY_IMAGE"
NEW_IMAGE='pica-library:0.4.11-<new-source>-docker-amd64-experimental'

docker image inspect "$NEW_IMAGE" >/dev/null
docker run --rm --entrypoint cat "$NEW_IMAGE" /opt/pica/SOURCE_SHA.txt

export PICA_LIBRARY_IMAGE="$NEW_IMAGE"
docker compose -f packaging/docker/server-preview/compose.yaml   up -d --force-recreate pica-init pica caddy
docker compose -f packaging/docker/server-preview/compose.yaml ps
curl https://"$PICA_LIBRARY_DOMAIN"/healthz
```

If the candidate raises the database schema, the automated replacement gate
also requires the ordinary pre-migration SQLite backup before it can pass.

## Roll back

If candidate health or acceptance fails:

1. stop Caddy and Pica;
2. restore the matching pre-candidate `/config` snapshot;
3. reset `PICA_LIBRARY_IMAGE` to the recorded old image;
4. recreate the services;
5. verify health, source identity, schema and important user state.

A restore is destructive to state written after the snapshot, so choose the
snapshot deliberately.

The automated W4B gate performs this exact model with synthetic data:
baseline image -> stopped config snapshot -> candidate image -> candidate-only
state -> stopped restore -> baseline image, and verifies that candidate-only
state disappears after rollback.

## Current limitations

This bundle is still experimental:

- no public registry/server-preview channel is published yet;
- there is no remote browser/PWA session model;
- there is no multi-user or tenant isolation;
- real Provider credentials and Provider behavior are outside the Docker CI
  fixtures;
- formal image signing/attestation and long-lived release promotion policy are
  still separate gates.

The safe default remains local Desktop/Android usage unless an operator
explicitly chooses this server preview.
