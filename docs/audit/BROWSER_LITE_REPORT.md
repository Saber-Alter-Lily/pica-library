# Browser Lite Report

Browser Lite remains a static-site mode with no Local Engine dependency. It
imports schema-versioned Portable Bundles, rejects sensitive fields, persists
state and author decisions in IndexedDB, clears state on request, and exports a
deduplicated portable download plan.

Cover URLs are optional untrusted metadata. Imports and restored state drop
unsafe references before rendering; invalid covers use the local fallback.
Automated tests cover invalid/sensitive bundles, unsafe cover fallback,
persistence round trip, queue deduplication, 1770-record page bounds, a
precomputed tag-frequency index, and discriminative tag selection.

Actual responsive QA used only synthetic data at 1280x720 and 390x844. Home,
Library Grid/List, Discover, Downloads and Maintenance had no document-level
horizontal overflow. The compact list intentionally scrolls inside its wrapper.
Long titles/tags remained contained, navigation and visible buttons were
reachable, unsafe `data:`/localhost covers fell back locally, reload restored
state, and clear removed both state and rendered recommendation cards.
