# Architecture

Pica Library is one modular application, not three products.

```text
Interfaces     Web                         CLI
                  \                       /
Product        Library -> Discover -> Download -> Maintain
                         | persistent state |
Runtimes       Browser Lite   Local Engine   GitHub Runner
Storage        IndexedDB      SQLite         GitHub Artifact
Provider                       Pica
```

Browser Lite validates a versioned portable Bundle, restores prepared recommendations
and portable queue data, and persists records, author decisions, recommendation state
and plans in IndexedDB without credentials. Users can clear that browser-local state.
The local HTTP server binds to `127.0.0.1` by default and rejects cross-origin
writes. CLI and Web API call the same `LibraryService`, `LibraryDatabase`, download
state machine and scheduler. The GitHub workflow is only a manual ephemeral runner
for that shared CLI.

## Persistent model

SQLite migrations own canonical comics, authors and aliases, relationships,
episodes, pictures, favorite snapshots, sync runs, download jobs and items, update
findings, recommendation profiles and results. Stable provider IDs are primary keys.
Re-import updates metadata without duplicating entities.

## Download lifecycle

Jobs transition through `DRAFT`, `QUEUED`, `PREPARING`, `RUNNING`, `PAUSED`,
`RETRY_WAIT`, `COMPLETED`, `FAILED`, or `CANCELLED`. A job scheduler enforces job
concurrency, priority and exponential retry. One shared media gate across all active
jobs enforces global transfer concurrency and request-start spacing. Picture
downloads retain upstream checks for `allowDownload`, episode selection, `.part`
files, atomic rename, SHA-256 and verified incremental skips.

## Maintenance

Update scanning compares provider episodes against persisted episode IDs, orders
and metadata, then creates reviewable findings. Repair scans persisted file state for
missing, empty or failed pictures. Neither path downloads directly; approved work is
added to the unified queue. Low-confidence author identities stay in the Maintenance
inbox until a user approves, separates, researches or merges them.
