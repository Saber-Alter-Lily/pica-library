# Reader reliability: isolated baseline integration, not an installation candidate

This work reconciles the implemented local Reader maintenance with the frozen `9e879d3aa7030d1fc49a92354f54bba0bd610074` source. It does not replace the immutable r2/Dev82 installables, declare a new Git commit for an assembled tree, or make all local profile-recovery work a prerequisite for reader testing.

## Deliberate cut

The source assembly takes the frozen tree, then applies explicitly listed, byte-verified files for account-free onboarding and Web input/viewport/progress maintenance. It also retains the independently useful Desktop instance/owned-profile initialization fix, with its data-only theme-validation dependency and tests. A second instance must not initialize profile content before acquiring the instance slot. This is not a new backup feature or proof of a global writer barrier.

No `src/profile-backup` implementation, unfinished recovery commands/UI, ZIP64 libraries/type additions, archive-stage tests or unrelated local changes are silently included. Excluded files remain in the original local branch and task ledger; they are not reverted, deleted, accepted or forgotten. Existing package/lockfile, database/schema, Android, source/sync/recommendation algorithms, runtime assets, public module declarations and stable OTA stay at the frozen baseline except for the exact approved Reader-service maintenance files.

The Windows packager additionally gains a small read-only checkout-root precondition. A Gitless source tree nested inside another checkout must not borrow the ancestor's SHA as its own. Genuine checkout/worktree roots are distinguished by Git's inside-work-tree/prefix facts, not Windows path spelling. The guard runs before provenance overrides, deletions, builds or downloads. An assembled source cut is therefore not directly buildable as an invented Git revision; a later authorized Draft branch must first represent it honestly in Git.

## Identity and evidence

An assembled snapshot has a baseline SHA, exact source-blob authority, per-file origins/digests and a manifest fingerprint. **It has no independent Git commit SHA.** Its tests bind to that fingerprint, not the surrounding checkout's HEAD. Native browser/app/Java/HTTP/upgrade/provider execution remains forbidden locally by the current validation policy.

Source/type/syntax and selected pure/mock/owned synthetic-file tests can establish integration feasibility. They cannot replace exact-source CI, actual Windows/APK package/signature verification, browser/phone/user/source acceptance or physical one-action upgrade/retention checks. Results and inclusion/exclusion inventories live in the separate handoff; no prior green candidate is relabeled as validating this cut.

The existing signed r2/Dev82 package remains unchanged. No app is started/installed, no production or credential file is opened, and no push/PR change/merge/tag/Release/OTA/deployment is performed. Full local-first/content-free/user-managed-source modular Reader, source trust/native/sync/asset provenance and unfinished recovery scope remain OPEN.

The next external gate, if later authorized, is to materialize a real isolated Git candidate and run its complete Draft CI/build matrix. This document is not that authorization or a claim that such a build exists.
