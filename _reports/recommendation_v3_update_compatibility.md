# Recommendation V3 update compatibility

Migration 8 is additive-only and does not rename, drop, or reinterpret legacy tables. New event, graph, profile, candidate-pool, and batch tables are nullable/defaulted and isolated from v0.2 queries. The stable update builder emits manifest v1 incremental metadata with API 2 and schema 8. The Windows package script supports the v0.3.0 stable full package while retaining v0.2.0 development package names.

Evidence obtained locally: v0.3.0 full Windows package built; stable manifest v1 incremental package generated with API 2/schema 8 and `requiresFullInstall=false`; the project UpdateManager accepted it in a temporary stage directory. The bundled updater process simulation then reached `complete` for the normal path and `failed` with `rollbackRestored=true` after a deliberate health-check failure, using isolated temporary installs and no user data.
