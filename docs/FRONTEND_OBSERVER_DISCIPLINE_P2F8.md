# Incremental Visual QC DOM Mutation Processing — P2 F8

Status: **Visual QC body observer retained as event source, but detail/QC work is now scoped to changed subtrees**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 scoped UX polish observers.
- F3 separated selection render authorities.
- F4 made parity mutations incremental.
- F5 made Product cleanup incremental.
- F6 scoped Settings Hub observation.
- F7 makes onboarding target discovery incremental.

## Finding

`web/visual-qc.js` owns three dynamic responsibilities:

1. ensure the Visual QC panel exists in Settings;
2. add fallback Details buttons to Library / Downloaded / Shelves cards that do not already have a native detail action;
3. attach one failure-capture observer to the Visual index build controls.

Before F8, one coalesced body MutationObserver ran all three installers after **any** child mutation anywhere in the application:

- `a88EnsurePanel()`;
- `a88InstallDetailButtons()`;
- `a88InstallIndexFailureCapture()`.

The callback was animation-frame coalesced, but each pass still performed global ownership checks.

## F8 detail-button scope

`a88InstallDetailButtons(root = document)` is now root-aware.

`a88SectionsWithin(root)` resolves only:

- `#library`;
- `#downloaded`;
- `#shelves`

when the root itself matches or contains those sections.

The initial bootstrap still calls the default full-document form once.

Ordinary MutationObserver processing calls the scoped form only for changed/added roots.

Existing idempotence remains authoritative:

- cards with `.a88-detail-trigger` are skipped;
- cards with native `[data-library-detail]` are skipped.

## F8 settings relevance

QC panel/failure-capture installation is only relevant when dynamically added content is or contains:

- `#settings-recommendation-v4`;
- `#a87-recommendations-panel`;
- `#visual-index-build`;
- `#visual-index-message`.

F8 marks `settingsDirty` only for those additions.

The animation-frame pass calls:

- `a88EnsurePanel()`;
- `a88InstallIndexFailureCapture()`

only when that flag is set.

## F8 mutation queue

The body observer remains one broad event source because Visual QC detail buttons span several product surfaces.

The callback now:

1. consumes MutationObserver records;
2. iterates only `mutation.addedNodes`;
3. collects unique element roots in `pendingRoots`;
4. marks Settings relevance only for Visual/Settings additions;
5. schedules one requestAnimationFrame pass;
6. installs detail buttons only inside pending roots;
7. runs QC-panel/failure-capture installers only when Settings is dirty.

Removed-only mutations do not schedule Visual QC installer work.

## Why the body observer remains

There is no single stable parent shared by:

- Library cards;
- Downloaded cards;
- Shelf cards;
- Settings/Visual controls.

Maintaining several independent observers would create more authorities than one incremental broad event source.

F8 therefore keeps one body observer but removes global work from each callback.

## Regression contract

The Web UX source contract requires:

- `pendingRoots = new Set()`;
- MutationObserver records / `mutation.addedNodes`;
- animation-frame coalescing;
- scoped `a88InstallDetailButtons(root)`;
- a Settings relevance flag;
- QC panel/failure capture only inside `if (settingsDirty)`.

It forbids the old direct:

`new MutationObserver(schedule)`

form.

Real-browser smoke remains the end-to-end regression for Library/Downloaded/Shelves detail actions and Settings Visual QC.

## Preserved behavior

F8 does not change:

- Visual embedding/QC data;
- Visual similarity retrieval;
- manual QC scoring;
- index failure capture semantics;
- existing native detail actions;
- dialog behavior;
- settings lazy-load policy;
- Visual recomputation policy.

## Deliberate non-scope

F8 does not:

- remove the body observer;
- change Visual task polling/status;
- alter Visual index build behavior;
- change Product/Onboarding/Hub observers already handled by other F batches;
- set a browser CPU budget.

## Next P2-F work

After F8:

1. inventory persistent backend pollers with explicit owner/start/stop lifecycle;
2. audit onboarding welcome retry timing separately from target discovery;
3. audit feature-specific status pollers for duplicate authorities;
4. collect low-end browser performance traces before quantitative responsiveness budgets.
