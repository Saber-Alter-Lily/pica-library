# Pica Library Theme Pack Creator — Fixed AI Prompt

This file is bundled into the **Theme Creator Kit** exported by Pica Library Desktop/Web. The human user should not need to rewrite this prompt. An AI receiving the exported ZIP should read `00_READ_ME_FIRST.md`, this prompt, the specification, the request text, and every supplied reference image, then return a finished theme archive.

---

## MASTER PROMPT FOR THE AI

You are creating a complete **Pica Library Theme Pack v1** for both the Desktop/Web UI and the Android UI.

The user has already described the desired theme in `01_THEME_REQUEST.txt` and may have supplied reference images under `reference-images/`. Treat those files as the visual authority for the requested character, mascot, palette, mood, clothing, background motifs, or other appearance cues.

Your final deliverable is one data-only ZIP archive named:

`<stable-theme-id>.pica-theme`

Do not return application source code as the main deliverable. Do not modify Pica Library itself. Create the theme assets and JSON configuration, package them, validate them, and return the finished archive.

## 1. Required package structure

Create exactly these configuration files and nine core visual assets:

```text
<theme-id>.pica-theme
├─ manifest.json
├─ palette.json
├─ layout.json
├─ components.json
└─ assets/
   ├─ mascot-main.webp
   ├─ mascot-head.webp
   ├─ recommendation-loading.webp
   ├─ empty-state.webp
   ├─ nav-library.webp
   ├─ nav-recommend.webp
   ├─ nav-online.webp
   ├─ nav-connect.webp
   └─ pattern.webp
```

You may add a very small number of additional raster assets under `assets/` only when they materially improve the same theme, but the nine files above are the normal required output.

Allowed content is strictly:

- `manifest.json`
- `palette.json`
- `layout.json`
- `components.json`
- PNG/JPG/JPEG/WebP raster images under `assets/`

Never include JavaScript, TypeScript, Java, Kotlin, Python, shell files, HTML, SVG, fonts, executable files, DLLs, native libraries, plug-ins, symlinks, remote URLs used as assets, or nested archives.

## 2. What the theme changes

The same pack is used by Desktop/Web and Android. It may visually customize:

- application background and subtle decorative pattern;
- header / brand decoration;
- navigation icon appearance and selected state;
- page titles and decorative typography presets;
- cards, panels, dialogs, pills, chips, inputs and buttons;
- comic-card radius / border / elevation parameters;
- progress bars and their animated leading mascot head;
- recommendation-generation loading artwork;
- empty-state artwork;
- metrics / charts / decorative data-visualization accents;
- connection/status surfaces while preserving status meaning;
- limited reader chrome colors, but never the comic pages themselves.

The pack must never move or hide functional controls, change navigation destinations, alter reader gestures, replace payment QR codes, change network endpoints, change update verification, or change application behavior.

## 3. Visual design goals

Pica Library is a comic library first. A successful theme should feel clearly personalized without fighting the comic covers.

- Keep large content regions visually calm.
- Put detailed character art mainly in `mascot-main`, loading/empty illustrations, and compact decorative areas.
- Keep `pattern.webp` transparent or low-contrast so it can sit behind content.
- Keep navigation icons simple enough to read at small sizes.
- Keep the progress-head crop readable at roughly 20–28 dp.
- Ensure light and dark palettes both work.
- Avoid baked-in functional text inside illustrations.
- Avoid fake buttons, QR codes, login fields, system dialogs, permission prompts, or notification imitations.

## 4. Required image roles

### `assets/mascot-main.webp`

- Transparent background preferred.
- Suggested canvas: 1200×1200 or similar.
- Main mascot / character art used in personalization, headers and decorative empty space.
- Keep important character features away from extreme edges.

### `assets/mascot-head.webp`

- Transparent background required.
- Suggested canvas: 512×512.
- Tight head / face / emblem crop designed to remain readable at 20–28 dp.
- Used at the moving leading edge of determinate progress bars.
- Do not include a rectangular background.

### `assets/recommendation-loading.webp`

- Suggested canvas: 1600×900.
- Illustration for the recommendation-generation card.
- Put the main subject on one side and leave generous quiet space for real progress text and the real progress bar.
- No baked-in progress percentage or UI text.

### `assets/empty-state.webp`

- Suggested canvas: 1024×1024.
- Friendly illustration for no-results / no-recommendations / no-content states.
- No fake action buttons.

### Navigation icons

Files:

- `nav-library.webp`
- `nav-recommend.webp`
- `nav-online.webp`
- `nav-connect.webp`

Requirements:

- Transparent background.
- Suggested canvas: 256×256 each.
- Same illustration language and line weight.
- Strong silhouette at small size.
- Do not draw the Chinese labels into the images; Pica Library renders the real labels.
- Library: book / shelf / collection concept.
- Recommend: star / sparkle / discovery concept.
- Online: network / globe / cloud-comic concept.
- Connect: phone-computer / link / connection concept.

### `assets/pattern.webp`

- Transparent background required.
- Suggested canvas: 1024×1024, tile-friendly.
- Low-contrast repeating motif such as stars, manga halftone dots, speech bubbles, cat silhouettes, flowers, geometric shapes, etc.
- It will be rendered at low opacity behind UI content.

## 5. `manifest.json`

```json
{
  "themeFormatVersion": 1,
  "id": "stable-theme-id",
  "name": "Human-readable Theme Name",
  "author": "Theme Creator",
  "version": "1.0.0",
  "description": "One concise sentence describing the theme."
}
```

Rules:

- `themeFormatVersion` must be `1`.
- `id` must match `[a-z0-9][a-z0-9._-]{0,63}`.
- Keep the same id for future revisions of the same design.
- Do not put dates or random hashes into the id unless the request explicitly requires them.

## 6. `palette.json`

Both modes are required.

```json
{
  "light": {
    "primary": "#7457B9",
    "primarySoft": "#E9DFFF",
    "secondary": "#FFB8DA",
    "accent": "#7DD3FC",
    "background": "#F7F3FB",
    "surface": "#FFFFFF",
    "nav": "#F0EAF6",
    "text": "#201E24",
    "muted": "#68636E",
    "outline": "#D8D2DC",
    "action": "#E7E4EA",
    "progressTrack": "#E9DFFF",
    "progressFill": "#7457B9"
  },
  "dark": {
    "primary": "#D6BCFF",
    "primarySoft": "#503681",
    "secondary": "#FFB8DA",
    "accent": "#7DD3FC",
    "background": "#15121B",
    "surface": "#241E2C",
    "nav": "#1D1824",
    "text": "#F4EFF7",
    "muted": "#C7C1CC",
    "outline": "#49454F",
    "action": "#2B2730",
    "progressTrack": "#3B3150",
    "progressFill": "#D6BCFF"
  }
}
```

All colors must be six-digit `#RRGGBB`. Preserve readable contrast. Do not redefine success/warning/error semantics.

## 7. `layout.json`

```json
{
  "cardRadiusDp": 20,
  "coverRadiusDp": 14,
  "density": "standard"
}
```

Allowed values:

- `cardRadiusDp`: 8–28
- `coverRadiusDp`: 4–24
- `density`: `compact`, `standard`, or `comfortable`

Do not encode arbitrary positions, negative margins, hidden controls, or absolute overlays.

## 8. `components.json`

Use only the supported presets:

```json
{
  "typography": {
    "title": "comic",
    "navigation": "rounded"
  },
  "navigation": {
    "selectedEffect": "pill",
    "iconScale": "standard"
  },
  "progress": {
    "style": "mascot",
    "headAsset": "assets/mascot-head.webp",
    "motion": "bobble",
    "effect": "sparkle"
  },
  "background": {
    "patternAsset": "assets/pattern.webp",
    "patternOpacityLight": 0.10,
    "patternOpacityDark": 0.08
  },
  "reader": {
    "chrome": "themed"
  }
}
```

Supported values:

- title typography: `default`, `rounded`, `comic`, `cute`
- navigation typography: `default`, `rounded`, `comic`, `cute`
- selected effect: `none`, `pill`, `glow`
- icon scale: `small`, `standard`, `large`
- progress style: `classic`, `star`, `mascot`, `paw`
- progress motion: `none`, `bobble`, `hop`
- progress effect: `none`, `sparkle`
- reader chrome: `default`, `themed`
- pattern opacity: 0.00–0.18

## 9. Safety and size checks

Before delivery, verify:

1. archive opens as a valid ZIP;
2. `manifest.json` is at the archive root;
3. all four JSON files parse;
4. themeFormatVersion is 1;
5. id is valid;
6. light and dark palettes exist;
7. colors use `#RRGGBB`;
8. required nine assets exist;
9. no executable/script/HTML/SVG/font content exists;
10. no absolute or traversal paths exist;
11. archive is below 24 MiB;
12. each file is below 8 MiB;
13. file count is below 120;
14. navigation icons remain clear at small size;
15. mascot head is transparent and readable at small size;
16. pattern is subtle;
17. illustrations contain no fake functional UI;
18. light mode remains readable;
19. dark mode remains readable;
20. the theme works without any internet-hosted assets.

## 10. Final output

Return:

1. the finished `<theme-id>.pica-theme` archive;
2. a brief summary of the design;
3. PASS/FAIL for the 20 checks above.

If your environment cannot return a file archive, create the exact folder contents and explicitly instruct the user to ZIP the **contents** so `manifest.json` sits at the ZIP root. However, when file-generation capability exists, return the completed archive directly.

---

The Desktop importer and Android importer treat every theme archive as untrusted input and independently validate it. Invalid content should fail closed.