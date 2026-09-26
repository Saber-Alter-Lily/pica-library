# Desktop Browser Home / Library Benchmark — P2 J4

Status: **measurement harness candidate / no browser budget selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J3 Desktop process startup/shutdown measurement;
- existing Playwright Chromium Web smoke.

## Purpose

J3 measures the Desktop process.

J4 measures the next user-facing boundary:

**an already-ready loopback Desktop engine → real Chromium → usable Web shell / Library**

J4 does not combine engine startup with browser startup. Keeping these windows
separate makes it possible to distinguish:

- slow Desktop process/database/server startup;
- slow Chromium process launch;
- slow Web shell boot/local API reads;
- slow Library view transition.

## Open-source implementation

J4 reuses Playwright Chromium rather than adding a custom browser driver.

Pinned harness version:

`@playwright/test 1.63.0`

This matches the repository's existing real-browser smoke version.

Playwright remains a benchmark/CI tool and is not added to `package.json` or
the production dependency graph.

The J4 runner installs it into a temporary tool directory and points the
benchmark at that directory with:

`PICA_PLAYWRIGHT_TOOL_ROOT`

Chromium binaries are likewise isolated through `PLAYWRIGHT_BROWSERS_PATH`.

## Engine prerequisite

J4 requires a loopback Desktop engine that is already API-ready.

The runner prepares this state outside the measured browser window:

1. build the repository;
2. create an isolated Desktop home and Library directory;
3. start `dist/desktop.js --headless`;
4. wait for the real instance file + Desktop status endpoint;
5. POST synthetic local settings through the real Desktop API;
6. wait for the configured engine restart to complete;
7. start browser measurement.

The synthetic settings use:
- synthetic account/password values;
- a temporary absolute Library path;
- balanced profile;
- dead loopback proxy `http://127.0.0.1:9`.

Credential persistence is allowed only when the live Desktop reports:
- `windows-dpapi`, where the protected credential file lives under the isolated
  temporary Desktop home; or
- `session-memory`, where no persistent system credential is written.

The runner refuses `macos-keychain`, `linux-secret-service`, and unknown
credential backends so a benchmark cannot overwrite a developer's real
system-level Pica credential entry.

The dead proxy prevents successful external Provider access from becoming a
benchmark prerequisite.

No configured real credential is read or exported.

## First-run UI preparation

Each browser context sets local-only state before any page script executes:

- UI language = Simplified Chinese;
- disclaimer version 1 accepted;
- onboarding version 1 completed.

These are outside the measured product work being studied. The goal is to time
the normal usable application shell rather than first-run legal/tutorial
interaction.

## Measurement rounds

Default:

`5 rounds`

Each round launches a **new Chromium process**.

### Browser launch

`browserLaunchMs`

Measures:
- immediately before `chromium.launch()`;
- until the browser object is returned.

### Navigation → shell usable

`navigationToShellUsableMs`

Starts immediately before:

`page.goto(loopbackRoot)`

The shell is considered usable only when:

- `#home` is the active view;
- the primary nav is visible;
- `#mode` has left the detecting state;
- `#library-count` is non-empty.

The last condition matters: it proves the connected startup path completed its
local status/catalog/library-query work rather than merely reaching
`DOMContentLoaded`.

The benchmark intentionally does **not** use DOMContentLoaded as the product
readiness signal.

### Shell → Library usable

After shell readiness, J4 clicks the actual:

`nav [data-view="library"]`

It records:

- `shellToLibraryUsableMs`;
- `libraryClickToUsableMs`.

Library is usable only when:

- `#library` is active;
- `#library-count` remains populated;
- the real Library filter input exists and is enabled.

### Total browser/user boundaries

J4 also reports:

- `navigationToLibraryUsableMs`;
- `browserLaunchToShellUsableMs`;
- `browserLaunchToLibraryUsableMs`.

This keeps browser-process cost separable while still exposing an end-to-end
user-perceived interval.

## Recommendation/provider behavior

The Web startup path may begin Recommendation preparation after local Library
state is available.

J4 readiness does not wait for Provider Recommendation completion.

This is deliberate:
- the ordinary Library shell must be usable while Provider work is slow/offline;
- the dead loopback proxy prevents accidental dependence on Internet/provider
  success;
- J4 therefore measures local foreground usability, not Provider throughput.

Loaded-provider foreground behavior belongs to J2/G19-style load scenarios and
P2-K evidence.

## Error policy

A browser `pageerror` before shell or Library readiness invalidates the round.

The benchmark does not treat expected Provider unavailability as a browser
error merely because server-side background work cannot reach the dead proxy.

## Machine-readable output

Default:

`test-results/desktop-browser-home/desktop-browser-home-benchmark.json`

The report contains:

- commit SHA;
- platform / arch / Node / CPU / memory;
- Chromium version;
- fixed viewport/language protocol;
- all raw samples;
- min / median / max summaries.

The report does **not** include:

- loopback URL/port;
- temporary Playwright directory;
- temporary Desktop home/Library path;
- Desktop CSRF token;
- synthetic account/password;
- Provider credentials;
- stdout/stderr.

## CI harness validation

Workflow:

`.github/workflows/desktop-browser-home-harness.yml`

CI runs two rounds with:

- `--harness-validation-only`;
- temporary Playwright install;
- Chromium system dependencies installed outside the measured window;
- synthetic isolated Desktop state.

This proves the journey is executable.

GitHub-hosted runner browser timings are not P2-K evidence.

## Reference-machine use

Run:

`node scripts/run-desktop-browser-home-harness.mjs --rounds=7`

On a Windows x64 reference machine this performs the same build/tool/setup
protocol and emits the same JSON schema.

For comparable evidence record:
- machine/CPU;
- Windows version;
- display/refresh configuration where relevant;
- power mode;
- commit;
- rounds;
- min/median/max.

Do not compare a Windows reference result directly to CI Ubuntu timing as if
they were equivalent hardware.

## Relationship to J3

J3:
- process spawn → instance/API ready;
- graceful shutdown.

J4:
- Chromium launch;
- browser navigation → usable Home shell;
- real Library navigation → usable Library.

Together they isolate where startup time is spent.

They still do not establish a budget.

## Remaining P2-J work

After J4 source/harness acceptance:

1. collect representative Windows x64 J3 + J4 evidence;
2. add detail/shelf/Reader browser journeys where useful;
3. measure recommendation generation vs batch switch separately;
4. capture long Reader memory/jank;
5. pair J2 foreground latency with real download/WebDAV/Visual workloads;
6. combine with Android physical G18/G19 evidence before P2-K budgets.

No browser-performance threshold is selected by J4.
