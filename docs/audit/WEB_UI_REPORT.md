# Web UI Report

The information architecture remains Home, Library, Discover, Downloads, and
Maintenance. Library defaults to a cover grid and offers a compact table view.
Both views share filtering, sorting, selection, and queue actions.

Library rendering is incremental: the initial page is 48 records and each
explicit load adds another 48. Cover images use a fixed 3:4 container, native
lazy loading, asynchronous decoding, `referrerpolicy="no-referrer"`, and a
deterministic fallback. A tag-frequency map is computed once per render and
reused for every card in Grid/List.

Connected covers use `/api/v1/covers/:comicId`; Browser Lite uses only sanitized
public HTTPS references. Default recommendation cards contain cover, title,
author, top tags and a compact Add to Download action. Reasons, score, recall,
matched profile signals, popularity and raw profile chips remain hidden while
the internal RecommendationResult retains full explainability.

Actual synthetic-data QA at 1280x720 and 390x844 inspected Home, Library
Grid/List, Discover, Downloads, and Maintenance. Document width matched viewport
width on all areas. Mobile navigation/actions were reachable, long titles/tags
were contained, the list scrolled inside its wrapper, unsafe covers fell back,
reload restored Browser Lite state, and clear removed state and rendered cards.
