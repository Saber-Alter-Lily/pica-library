# Browser Lite Report

Browser Lite remains a static-site mode with no Local Engine dependency. It
imports schema-versioned Portable Bundles, rejects sensitive fields, persists
state and author decisions in IndexedDB, clears state on request, and exports a
deduplicated portable download plan.

Cover URLs are optional metadata. No base64 image library is embedded in the
normal Bundle. Imported collections use the same 48-record incremental render
contract as connected mode. Automated tests cover import, invalid/sensitive
bundle rejection, persistence round trip, queue deduplication, 1770-record page
bounds, and discriminative tag selection.

Manual static-server QA confirmed Browser Lite mode without a Local Engine,
state restoration across reload (same comic/queue counts), prepared
recommendation rendering, and clear-state behavior. The final clear action
returned the library and plan counts to zero.
