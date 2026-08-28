# Recommendation V3 update compatibility

Migration 8 is additive-only and does not rename, drop, or reinterpret legacy tables. New event, graph, profile, candidate-pool, and batch tables are nullable/defaulted and isolated from v0.2 queries. The stable update builder emits manifest v1 incremental metadata with API 2 and schema 8. The Windows package script supports the v0.3.0 stable full package while retaining v0.2.0 development package names.

Evidence obtained locally: v0.3.0 full Windows package built; stable manifest v1 incremental package generated with API 2/schema 8, `requiresFullInstall=false`, source `c61bc07e08f7c5b531b609e56a12a0487a8fbc74`, target `7e5d8a1d8c132165973664b776a7c465dff47d30`; the project UpdateManager accepted it in a temporary stage directory. Full portable process apply/restart and health-failure rollback were not run in this pass and remain a release gate.
