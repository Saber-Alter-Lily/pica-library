# Web UI Report

The information architecture remains Home, Library, Discover, Downloads, and
Maintenance. Library defaults to a cover grid and offers a compact table view.
Both views share filtering, sorting, selection, and queue actions.

Library rendering is incremental: the initial page is 48 records and each
explicit load adds another 48. Cover images use a fixed 3:4 container, native
lazy loading, asynchronous decoding, and a deterministic fallback. This avoids
layout shift and prevents a 1770-record library from scheduling all image
requests at once.

Connected covers use `/api/v1/covers/:comicId`; Browser Lite uses an optional
safe cover reference from imported metadata. The local endpoint is not a
general URL proxy and caches bounded image responses only under the configured
data directory.

Actual Browser Lite desktop QA at 1280×720 inspected Home, Library Grid,
Discover, Downloads, and Maintenance. Document width matched viewport width on
all five views. Fixed-ratio fallback covers and long-title cards remained
usable. The in-app browser did not expose a reliable viewport resize control;
narrow-screen status is therefore based on the checked responsive CSS and is
left for final human verification rather than reported as an automated mobile
screenshot pass.
