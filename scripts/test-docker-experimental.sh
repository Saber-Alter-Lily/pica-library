#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:-}"
if [[ -z "$IMAGE" ]]; then
  if [[ -f "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt" ]]; then
    IMAGE="$(tr -d '\r\n' < "$ROOT/artifacts/DOCKER-EXPERIMENTAL-IMAGE.txt")"
  fi
fi
if [[ -z "$IMAGE" ]]; then
  echo "Usage: $0 <docker-image-tag>" >&2
  exit 2
fi

NAME="pica-library-headless-smoke-$"
REMOTE_NAME="${NAME}-remote"
REMOTE_TOKEN_FILE="$(mktemp)"
REMOTE_TOKEN="docker-remote-acceptance-token-0123456789abcdef"
printf '%s\n' "$REMOTE_TOKEN" > "$REMOTE_TOKEN_FILE"
chmod 0600 "$REMOTE_TOKEN_FILE"

dump_engine_log() {
  echo "----- Pica Library container log -----" >&2
  docker exec "$NAME" /bin/sh -c 'cat /config/logs/pica-library.log 2>/dev/null || true' >&2 2>/dev/null || true
  echo "----- end Pica Library container log -----" >&2
}
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker rm -f "$REMOTE_NAME" >/dev/null 2>&1 || true
  rm -f "$REMOTE_TOKEN_FILE"
}
trap cleanup EXIT

EXPOSED="$(docker image inspect "$IMAGE" --format '{{json .Config.ExposedPorts}}')"
if [[ -n "$EXPOSED" && "$EXPOSED" != "null" ]]; then
  echo "Experimental Docker image exposes a port: $EXPOSED" >&2
  exit 1
fi
if [[ "$(docker image inspect "$IMAGE" --format '{{.Config.User}}')" != "10001:10001" ]]; then
  echo "Experimental Docker image is not configured for non-root execution" >&2
  exit 1
fi
if [[ "$(docker image inspect "$IMAGE" --format '{{json .Config.Entrypoint}}')" != *'"--headless"'* ]]; then
  echo "Experimental Docker entrypoint is not headless" >&2
  exit 1
fi

docker run --detach --network none --name "$NAME" "$IMAGE" >/dev/null

wait_for_url() {
  local url=""
  for _ in $(seq 1 120); do
    if ! docker inspect "$NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
      echo "Docker headless engine exited during startup" >&2
      docker logs "$NAME" >&2 || true
      return 1
    fi
    url="$(docker exec "$NAME" /opt/pica/runtime/bin/node -e       "try{const fs=require('fs');const v=JSON.parse(fs.readFileSync('/config/runtime-state/instance.json','utf8'));process.stdout.write(String(v.url||''))}catch{}"       2>/dev/null || true)"
    if [[ -n "$url" ]] && docker exec "$NAME" /opt/pica/runtime/bin/node -e       "fetch(process.argv[1]+'/api/v1/desktop/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" "$url" >/dev/null 2>&1; then
      printf '%s' "$url"
      return 0
    fi
    sleep 0.25
  done
  echo "Docker headless engine did not become healthy" >&2
  docker logs "$NAME" >&2 || true
  return 1
}

URL="$(wait_for_url)"
STATUS_FILE="$(mktemp)"
docker exec "$NAME" /opt/pica/runtime/bin/node -e   "fetch(process.argv[1]+'/api/v1/desktop/status').then(async r=>{if(!r.ok)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))"   "$URL" > "$STATUS_FILE"

node - "$STATUS_FILE" <<'NODE'
const fs=require('fs')
const status=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const fail=(message)=>{throw new Error(message)}
if(status.application!=='Pica Library')fail('Unexpected application identity')
if(!status.runtime||status.runtime.mode!=='headless')fail('Headless runtime mode missing')
if(status.runtime.openBrowser!==false)fail('Container headless mode must not open a browser')
if(status.runtime.idleBrowserShutdown!==false)fail('Container headless mode must not idle-stop on browser close')
if(status.runtime.mobileBridge!==false)fail('Container headless mode must default Mobile Bridge off')
if(status.mobileBridge!==null)fail('Container unexpectedly started Mobile Bridge')
if(!status.platform||status.platform.id!=='linux')fail('Container platform identity missing')
if(status.platform.distributionReady!==false)fail('Experimental container must not be distributionReady')
if(status.platform.selfUpdate!==false)fail('Container self-update must remain disabled')
if(!status.credentialBackend||status.credentialBackend.kind!=='session-memory')fail('Minimal container should use session-memory credentials')
if(status.credentialBackend.securePersistence!==false)fail('Minimal container must not claim persistent credentials')
if(!status.csrfToken)fail('Desktop CSRF token missing')
NODE
rm -f "$STATUS_FILE"

if [[ -n "$(docker port "$NAME" 2>/dev/null)" ]]; then
  echo "Experimental Docker container unexpectedly publishes a host port" >&2
  exit 1
fi

UID_VALUE="$(docker exec "$NAME" /opt/pica/runtime/bin/node -e "process.stdout.write(String(process.getuid?.()??-1))")"
if [[ "$UID_VALUE" != "10001" ]]; then
  echo "Experimental Docker process is not running as UID 10001" >&2
  exit 1
fi

for required in /config/runtime-state/instance.json /config/data/library.db; do
  if ! docker exec "$NAME" /opt/pica/runtime/bin/node -e     "if(!require('fs').existsSync(process.argv[1]))process.exit(1)" "$required"; then
    echo "Container did not persist required runtime data: $required" >&2
    exit 1
  fi
done

# A normal container stop must map SIGTERM to the Desktop graceful shutdown path.
docker stop --time 10 "$NAME" >/dev/null
if [[ "$(docker inspect "$NAME" --format '{{.State.ExitCode}}')" != "0" ]]; then
  echo "Container did not exit cleanly after SIGTERM" >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi

# Restart the same container to prove /config state does not rely on process memory.
docker start "$NAME" >/dev/null
URL="$(wait_for_url)"

# The local authenticated shutdown endpoint must also close PID 1 cleanly.
docker exec -i "$NAME" /opt/pica/runtime/bin/node - "$URL" <<'NODE'
const url=process.argv[2]
const status=await fetch(url+'/api/v1/desktop/status').then(r=>r.json())
const response=await fetch(url+'/api/v1/desktop/shutdown',{
  method:'POST',
  headers:{
    'content-type':'application/json',
    'x-pica-csrf':status.csrfToken,
    Origin:url
  },
  body:'{}'
})
if(!response.ok)throw new Error('Headless shutdown endpoint failed')
const payload=await response.json()
if(payload.success!==true||payload.shutdownScheduled!==true)
  throw new Error('Headless shutdown endpoint did not confirm scheduling')
NODE

for _ in $(seq 1 60); do
  if [[ "$(docker inspect "$NAME" --format '{{.State.Running}}')" == "false" ]]; then
    break
  fi
  sleep 0.25
done
if [[ "$(docker inspect "$NAME" --format '{{.State.Running}}')" != "false" ]]; then
  echo "Container did not stop after local shutdown request" >&2
  docker logs "$NAME" >&2 || true
  dump_engine_log
  exit 1
fi
if [[ "$(docker inspect "$NAME" --format '{{.State.ExitCode}}')" != "0" ]]; then
  echo "Container shutdown endpoint produced a non-zero exit" >&2
  docker logs "$NAME" >&2 || true
  dump_engine_log
  exit 1
fi

# The separate Remote API is opt-in. It uses a secret file and never exposes
# the Desktop controller port itself.
docker run --detach   --name "$REMOTE_NAME"   -v "$REMOTE_TOKEN_FILE:/run/secrets/pica_remote_token:ro"   -e PICA_LIBRARY_REMOTE_TOKEN_FILE=/run/secrets/pica_remote_token   -e PICA_LIBRARY_REMOTE_HOST=0.0.0.0   -e PICA_LIBRARY_REMOTE_PORT=8787   -e PICA_LIBRARY_REMOTE_ALLOWED_HOSTS=127.0.0.1,localhost   -p 127.0.0.1::8787   "$IMAGE" --remote-api >/dev/null

REMOTE_PORT=""
for _ in $(seq 1 120); do
  REMOTE_PORT="$(docker port "$REMOTE_NAME" 8787/tcp 2>/dev/null | sed -n 's/.*://p' | head -n 1 || true)"
  if [[ -n "$REMOTE_PORT" ]] && curl --fail --silent "http://127.0.0.1:$REMOTE_PORT/healthz" >/dev/null 2>&1; then
    break
  fi
  if ! docker inspect "$REMOTE_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
    echo "Remote API container exited during startup" >&2
    docker logs "$REMOTE_NAME" >&2 || true
    exit 1
  fi
  sleep 0.25
done
if [[ -z "$REMOTE_PORT" ]]; then
  echo "Remote API did not publish an explicit test port" >&2
  exit 1
fi
REMOTE_URL="http://127.0.0.1:$REMOTE_PORT"

if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' "$REMOTE_URL/api/v1/capabilities")" != "401" ]]; then
  echo "Remote API allowed an unauthenticated capability request" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H 'Authorization: Bearer wrong-token-value-that-is-long-enough' "$REMOTE_URL/api/v1/capabilities")" != "401" ]]; then
  echo "Remote API accepted the wrong token" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $REMOTE_TOKEN" "$REMOTE_URL/api/v1/capabilities")" != "200" ]]; then
  echo "Remote API rejected the configured token" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $REMOTE_TOKEN" -H 'Host: attacker.example' "$REMOTE_URL/api/v1/capabilities")" != "403" ]]; then
  echo "Remote API Host allowlist was bypassed" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $REMOTE_TOKEN" -H 'Origin: https://attacker.example' "$REMOTE_URL/api/v1/capabilities")" != "403" ]]; then
  echo "Remote API Origin allowlist was bypassed" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $REMOTE_TOKEN" "$REMOTE_URL/api/v1/desktop/status")" != "404" ]]; then
  echo "Remote API exposed the Desktop controller" >&2
  exit 1
fi
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "Authorization: Bearer $REMOTE_TOKEN" -H 'content-type: application/json' --data '{}' "$REMOTE_URL/api/v1/import")" != "404" ]]; then
  echo "Remote API exposed the import mutation" >&2
  exit 1
fi

REMOTE_QUERY="$(
  curl --fail --silent     -X POST     -H "Authorization: Bearer $REMOTE_TOKEN"     -H 'content-type: application/json'     --data '{"scope":"favorites","limit":1}'     "$REMOTE_URL/api/v1/library/query"
)"
node - "$REMOTE_QUERY" <<'NODE'
const value=JSON.parse(process.argv[2])
if(!Number.isInteger(value.total)||!Array.isArray(value.items))
  throw new Error('Remote library query contract failed')
NODE

if docker exec "$REMOTE_NAME" /opt/pica/runtime/bin/node - "$REMOTE_TOKEN" <<'NODE'
const fs=require('fs')
const path=require('path')
const needle=process.argv[2]
const stack=['/config']
while(stack.length){
  const current=stack.pop()
  for(const name of fs.readdirSync(current)){
    const file=path.join(current,name)
    const stat=fs.lstatSync(file)
    if(stat.isDirectory()){ stack.push(file); continue }
    if(stat.isFile()&&fs.readFileSync(file).includes(needle))process.exit(1)
  }
}
NODE
then
  :
else
  echo "Remote API token leaked into persistent /config data" >&2
  exit 1
fi

docker stop --time 10 "$REMOTE_NAME" >/dev/null
if [[ "$(docker inspect "$REMOTE_NAME" --format '{{.State.ExitCode}}')" != "0" ]]; then
  echo "Remote API container did not exit cleanly" >&2
  docker logs "$REMOTE_NAME" >&2 || true
  exit 1
fi
docker start "$REMOTE_NAME" >/dev/null
for _ in $(seq 1 120); do
  if curl --fail --silent "$REMOTE_URL/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $REMOTE_TOKEN" "$REMOTE_URL/api/v1/capabilities")" != "200" ]]; then
  echo "Remote API did not recover after container restart" >&2
  exit 1
fi

echo "Docker headless experimental smoke: PASS"
