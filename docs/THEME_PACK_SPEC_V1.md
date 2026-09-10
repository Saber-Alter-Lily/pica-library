# Pica Library Theme Pack v1

Pica Theme Pack is a **data-only visual package** shared by Pica Library Desktop/Web and Android. It cannot contain executable code, scripts, HTML, fonts, plug-ins, native libraries, or network instructions.

The package extension is `.pica-theme`. Internally it is a standard ZIP archive.

## 1. V1 product surface

A V1 theme may change visual presentation only:

- application canvas/background and low-opacity pattern;
- header/brand decoration;
- navigation icon art, selected-state appearance, and navigation label style;
- page-heading typography preset;
- cards, panels, dialogs, pills, chips, input fields and buttons;
- comic-cover/card corner radii and restrained elevation/border treatment;
- determinate progress bars, including a small mascot/icon that follows the real progress position;
- recommendation-generation artwork;
- generic empty-state artwork;
- metrics/charts decorative accents;
- connection/status surfaces while preserving semantic state meaning;
- limited reader chrome colors, never comic-page pixels or reading behavior.

A theme may **not** move/hide controls, change navigation destinations, alter data sources, alter reader gestures, replace payment QR codes, alter login/update/security UI semantics, change network endpoints, execute code, or change application behavior.

## 2. Required package structure

The normal V1 output is deliberately small and predictable:

```text
my-theme.pica-theme
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

Accepted files:

- `manifest.json`
- `palette.json`
- `layout.json`
- `components.json`
- raster `.png`, `.jpg`, `.jpeg`, `.webp` files under `assets/`

The runtime rejects absolute paths, `..` traversal, scripts, HTML, SVG supplied by third-party packs, fonts, executable files, nested archives, symlinks, and unknown file types.

Safety limits:

- archive: at most 24 MiB;
- one entry: at most 8 MiB;
- entries: at most 120;
- theme id: `[a-z0-9][a-z0-9._-]{0,63}`.

## 3. `manifest.json`

```json
{
  "themeFormatVersion": 1,
  "id": "example-night-sakura",
  "name": "Night Sakura",
  "author": "Theme Creator",
  "version": "1.0.0",
  "description": "Dark violet theme with restrained sakura decoration."
}
```

`themeFormatVersion` must be 1. The id is stable across revisions of the same visual identity.

## 4. `palette.json`

Both light and dark modes are required for creator-generated V1 packs.

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

All colors use six-digit `#RRGGBB`. Invalid/missing optional tokens fall back to the built-in application palette.

Stable V1 tokens:

- `primary`, `primarySoft`
- `secondary`, `accent`
- `background`, `surface`, `nav`
- `text`, `muted`, `outline`, `action`
- `progressTrack`, `progressFill`

Success, warning, error, favorite, authentication and security semantics remain application-controlled.

## 5. `layout.json`

```json
{
  "cardRadiusDp": 20,
  "coverRadiusDp": 14,
  "density": "standard"
}
```

Valid ranges/presets:

- `cardRadiusDp`: 8–28;
- `coverRadiusDp`: 4–24;
- `density`: `compact`, `standard`, `comfortable`.

Layout values never permit arbitrary coordinates, negative margins, hidden controls, reordering, or overlays that cover application controls.

## 6. `components.json`

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

Allowed preset values:

| Field | Values |
| --- | --- |
| `typography.title` | `default`, `rounded`, `comic`, `cute` |
| `typography.navigation` | `default`, `rounded`, `comic`, `cute` |
| `navigation.selectedEffect` | `none`, `pill`, `glow` |
| `navigation.iconScale` | `small`, `standard`, `large` |
| `progress.style` | `classic`, `star`, `mascot`, `paw` |
| `progress.motion` | `none`, `bobble`, `hop` |
| `progress.effect` | `none`, `sparkle` |
| `reader.chrome` | `default`, `themed` |
| pattern opacity | number from 0.00 to 0.18 |

The application owns every animation implementation. The pack only selects a supported preset and supplies raster art.

## 7. Core asset roles

| Asset | Suggested source size | Background | Product use |
| --- | ---: | --- | --- |
| `mascot-main.webp` | ~1200×1200 | transparent preferred | header/personalization decorative mascot |
| `mascot-head.webp` | 512×512 | transparent required | leading head on real determinate progress bars |
| `recommendation-loading.webp` | 1600×900 | normal | recommendation generation card with quiet text area |
| `empty-state.webp` | 1024×1024 | normal/transparent | no-result / no-content illustration |
| `nav-library.webp` | 256×256 | transparent | library/shelf semantic navigation art |
| `nav-recommend.webp` | 256×256 | transparent | recommendation/discovery semantic navigation art |
| `nav-online.webp` | 256×256 | transparent | online/network semantic navigation art |
| `nav-connect.webp` | 256×256 | transparent | connection/settings semantic navigation art |
| `pattern.webp` | 1024×1024 | transparent required | low-opacity tileable background motif |

Navigation labels are rendered by Pica Library and must not be baked into icon images.

## 8. Desktop/Web rendering contract

A validated active theme can affect:

1. page canvas and pattern overlay;
2. header and brand decorative mascot;
3. app navigation icons and selected-state treatment;
4. page-title / navigation typography presets;
5. panel/card/dialog/input/button/chip visual tokens;
6. comic-card and cover radius;
7. all standard determinate progress bars, with `mascot-head` following the real percentage when the theme chooses a mascot progress style;
8. recommendation loading and empty states;
9. metric/chronicle/chart accent colors;
10. connection and settings surfaces;
11. reader chrome only.

Desktop navigation has more destinations than Android. It groups them into the same four visual families:

- library family: Home, Library, Shelves, Downloaded;
- recommendation family: Discover, Chronicle;
- online family: Downloads and network-related operations;
- connection family: Maintenance and Settings.

The labels and destination behavior never change.

## 9. Android rendering contract

Android keeps exactly four primary destinations: `书库 / 推荐 / 在线 / 连接`. Theme navigation icons may decorate these destinations, but the labels, ordering and actions remain fixed.

The same theme can also provide the mascot progress head, recommendation loading/empty artwork, page background pattern and visual tokens. Touch target dimensions, business logic, update/security checks and reader behavior remain fixed.

## 10. Creator input model

The ordinary user should only need to provide:

1. a short natural-language theme description;
2. one character/mascot reference image when relevant;
3. optionally one to three additional style/reference images.

Pica Library Desktop/Web exports those materials together with the fixed creator prompt, this specification and JSON templates into one **Theme Creator Kit ZIP**. The user gives that ZIP to a capable AI, and the AI returns a completed `.pica-theme` archive.

## 11. Installation and synchronization

Primary flow:

1. In Desktop/Web → **个性化装扮**, enter the theme description and select reference images.
2. Click **导出给 AI** to obtain the creator-kit ZIP.
3. Give the ZIP to an AI and request that it follow the included instructions and return the finished theme archive.
4. Drag the returned `.pica-theme` or `.zip` into Desktop/Web.
5. Desktop validates it and the user can apply it immediately to the webpage.
6. Desktop persists the active theme id.
7. On the next authenticated Desktop↔Android pairing/synchronization, Android downloads validated packs, validates them again, and can adopt the same active theme.

## 12. Readability and security

- Target WCAG AA contrast for ordinary text/background combinations.
- Preserve at least 48 dp equivalent touch targets on Android interactive controls.
- Comic covers remain visually dominant.
- Decorative layers must never obscure status text or controls.
- No theme asset may imitate a system warning, payment screen, login field, permission prompt, or security confirmation.
- QR codes and payment destinations remain application-owned.
- Theme content never executes.
- Desktop and Android validate independently and fail closed to the built-in appearance.