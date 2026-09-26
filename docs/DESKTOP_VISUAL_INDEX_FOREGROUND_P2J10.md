# Desktop Visual Index Foreground Impact — P2 J10

Status: **real-model harness candidate / external evidence required / no performance budget selected**

J10 measures foreground browser responsiveness while the actual Pica Library
Visual Web Worker performs real inference. It does not fabricate a backend
`cpu-model` lease: the current production Visual owner is the browser worker,
not `RuntimeResourceCoordinator`.

## Production path

The harness preserves:
- `web/visual-runtime.js` and `web/visual-worker.js`;
- `@huggingface/transformers@4.2.0`;
- `onnx-community/dinov2-small`;
- `pipeline('image-feature-extraction', ...)`;
- local downloaded pages from `/api/v1/visual/prepare`;
- real persistence via `/api/v1/visual/embedding`.

This follows the established Transformers.js Web Worker pattern for keeping
model inference off the browser UI thread.

## Explicit network gate

There is no synthetic inference mode. A valid run must observe real
Transformers.js/model requests and persist at least one new embedding.
Therefore real execution requires `--allow-model-network`; hosted CI only
runs source/contract checks and must not silently download the model.

## Foreground metrics

While indexing is active J10 records:
- Library ↔ Settings usable-navigation latency;
- requestAnimationFrame interval distribution;
- intervals above 34 ms and 50 ms;
- first persisted embedding elapsed time as separate bootstrap/inference
  evidence;
- observed model-request count/origins.

The first-embedding interval is not mixed into foreground navigation timing.

## Command

```bash
pnpm benchmark:desktop-visual-index -- \
  --allow-model-network \
  --rounds=5 \
  --timeout-ms=180000 \
  --output=test-results/j10.json
```

The existing J5/J6 runner supplies the isolated Desktop home, deterministic
downloaded-page fixture and temporary pinned Playwright installation.

## Validity and evidence boundary

Reject if the local fixture is not pending, no real model request is observed,
no embedding is persisted, a browser page error occurs, or foreground usable
states time out.

Shared-runner/model-download timing does not establish a P2-K budget. Reference
Windows x64 cold-cache and warm-cache runs remain external evidence. J10 also
does not claim full browser RSS, compositor frame telemetry, or backend
resource-enforcement capacity.
