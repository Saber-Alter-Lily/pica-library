# Scoped Settings Hub Observer — P2 F6

Status: **Settings Hub mutation ownership scoped to the Settings source root**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 scoped UX polish observers to Settings and Downloads.
- F3 separated selection render authorities.
- F4 made parity mutation work incremental.
- F5 made Product source-entry cleanup incremental.

## Finding

`web/alpha8-7-desktop-hub.js` builds the consolidated Settings Hub inside the Maintenance view and moves several settings-owned panels into the hub.

Its observer previously watched:

`document.body`

with:

`childList + subtree`.

The callback was animation-frame coalesced, but any DOM change in Library, Recommendation, Reader, Downloads or other views still scheduled:

- `moveProductSettingsPanels()`;
- `movePersonalization()`;
- hiding the legacy Settings navigation.

Those operations only care about Settings-origin panels.

## Ownership audit

The dynamic sources moved by the Hub are created under the legacy `#settings` root.

### Product Appearance

`alpha8-product.js -> appearancePanel()`

creates `#a83-appearance` under `#settings`.

### Product Support

`supportPanel()`

creates `#a83-support` under `#settings`.

### Personalization

`personalizationPanel()` and the Star access layer create `#a83-personalization` under `#settings` before the Hub moves it into the Appearance panel.

### Language control

The language selector starts in the static page header rather than inside Settings.

This does **not** require a permanent body observer:

- `buildSettingsHub()` performs the initial move explicitly;
- the language control is not dynamically recreated during ordinary runtime;
- language changes update labels through the existing change/language events.

### Hub structure

The Hub itself is created from the stable Maintenance + Settings roots during bootstrap.

After construction, `#settings` remains in the DOM as the hidden source container for settings-related modules that load later.

## F6 change

`installObservers()` now resolves:

`const settings = hub$('#settings')`

and installs its coalesced MutationObserver only on that root.

If `#settings` is unavailable, no observer is installed.

The existing animation-frame guard remains unchanged.

Therefore:

- later Product/Personalization panels appended to Settings still trigger relocation;
- Library/Recommendation/Reader/Download/result-card mutations do not trigger Hub relocation work.

## Regression contract

The Web UX source contract requires:

- Settings Hub observer to resolve `#settings`;
- observer target = Settings with `childList + subtree`;
- existing rAF coalescing to remain;
- absence of the old body-wide observer form.

Visual QC remains separately coalesced and is not changed by F6.

Real-browser smoke remains the end-to-end regression for the consolidated Settings Hub.

## Preserved behavior

F6 does not change:

- Hub tabs or labels;
- keyboard navigation;
- panel locations;
- language control placement;
- Product Appearance / Support;
- Personalization;
- preview-cache UI;
- Maintenance panels;
- Download history controls;
- navigation or scroll behavior.

## Deliberate non-scope

F6 does not:

- remove the Hub observer entirely;
- change Product panel creation;
- alter the 250 ms bootstrap fallback;
- change onboarding;
- change Visual QC;
- change backend pollers.

## Next P2-F work

After F6:

1. audit onboarding's body observer, which reruns all tour-target lookups for unrelated DOM changes;
2. audit Visual QC's body observer;
3. inventory persistent backend pollers by owner/start/stop lifecycle;
4. preserve body-wide observers only when insertion ownership is truly cross-surface and processing is incremental/coalesced.
