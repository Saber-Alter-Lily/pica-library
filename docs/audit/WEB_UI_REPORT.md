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
