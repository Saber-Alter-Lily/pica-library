# Desktop Visual Index Foreground Impact — P2 J10

Status: **real-model harness candidate / external real-model evidence required / no performance budget selected**

J10 measures foreground browser responsiveness while the actual Pica Library
Visual Web Worker performs real inference. It does not fabricate a backend
`cpu-model` lease: the current production Visual owner is the browser worker,
not `RuntimeResourceCoordinator`.

## Production architecture

The harness preserves the product path:
- `web/visual-runtime.js` and `web/visual-worker.js`;
- `@huggingface/transformers@4.2.0`;
- `onnx-community/dinov2-small`;
- `pipeline('image-feature-extraction', ...)`;
- local downloaded pages from `/api/v1/visual/prepare`;
- first-pass persistence through `/api/v1/visual/embedding`.

Hugging Face's current Transformers.js guidance recommends Web Workers for
computationally intensive browser inference so model work does not block the UI
main thread. J10 measures whether that architecture remains responsive in this
application rather than replacing it.

## Two-phase protocol

### Phase A — cold/bootstrap proof

J10 uses the real Settings → Build Visual Index UI.

The run is invalid unless:
- the deterministic local fixture is pending;
- the production Transformers.js CDN module is requested;
- DINOv2/model artifact network traffic is observed;
- the exact fixture leaves the pending list;
- `indexedCount` increases;
- the UI task returns to idle.

`firstEmbeddingElapsedMs` therefore contains cold model/library bootstrap,
network/cache effects, inference and first persistence. It is diagnostic only
and is not mixed into foreground latency.

### Phase B — warm production-worker load

After Phase A returns idle, J10 reuses the same loaded
`visual-runtime.js`/Web Worker and the same prepared local samples.

It runs `analyzeVisualSamples()` repeatedly without writing another embedding.
During that continuous warm-inference sequence it records only foreground
samples that remain fully inside the active inference window:

- Library ↔ Settings usable-navigation latency;
- requestAnimationFrame interval distribution;
- intervals above 34 ms and 50 ms;
- per-inference warm elapsed time.

If warm inference finishes before any complete RAF or navigation sample can be
captured, the run is rejected rather than mislabeled as an under-load benchmark.

## Explicit network gate

There is no synthetic inference mode. Real execution requires:

`--allow-model-network`

Hosted CI runs source/contracts only. It does not silently download DINOv2 or
promote shared-runner model timing into project performance evidence.

## Command

```bash
pnpm benchmark:desktop-visual-index -- \
  --allow-model-network \
  --rounds=5 \
  --timeout-ms=180000 \
  --output=test-results/j10.json
```

The shared J5/J6 browser runner provides:
- isolated Desktop home;
- deterministic local downloaded-page fixture;
- temporary pinned Playwright Chromium tool root;
- credential stripping and normal Desktop shutdown.

For J10 that runner automatically defaults to the longer 180 s timeout and the
J10 output path when the Visual benchmark script is selected.

## Evidence boundary

J10 does not establish:
- a Windows x64 reference budget;
- model download SLA;
- CDN/provider availability;
- full Chromium RSS;
- compositor frame telemetry;
- backend `cpu-model` resource enforcement capacity.

Representative Windows x64 cold-cache and warm-cache repetition remains P2-K
evidence. No concurrency/resource budget is selected here.
