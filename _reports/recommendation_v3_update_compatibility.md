# Recommendation V3 update compatibility

Migration 8 is additive-only and does not rename, drop, or reinterpret legacy tables. New event, graph, profile, candidate-pool, and batch tables are nullable/defaulted and isolated from v0.2 queries. The stable update builder emits manifest v1 incremental metadata with API 2 and schema 8. The Windows package script supports the v0.3.0 stable full package while retaining v0.2.0 development package names.

Required final evidence: build both full packages, generate `Pica-Library-v0.3.0-update.zip`, verify allowlisted paths and hashes, run the old UpdateManager against a schema-7 fixture, and exercise health-check rollback without touching user data.
