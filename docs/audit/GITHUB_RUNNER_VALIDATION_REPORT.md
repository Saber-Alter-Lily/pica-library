# GitHub Runner Validation Report

The established private source-repository runner baseline remains passed:

- Run: <https://github.com/Saber-Alter-Lily/pica-library/actions/runs/31622161014>
- Runner: `GITHUB`; status: `COMPLETED`.
- One comic, one episode, balanced profile.
- 30/30 pictures, 12,183,916 bytes, zero retries.
- One-day private artifact, valid manifest, no stale partial files, no secret
  exposure.

Private-caller architecture validation:

- Companion: `Saber-Alter-Lily/pica-library-runner`, PRIVATE.
- First dispatch was rejected during workflow parsing until private reusable
  workflow access was limited to same-user private repositories; no run or
  provider request was created.
- Run <https://github.com/Saber-Alter-Lily/pica-library-runner/actions/runs/31625422040>
  then passed the private-caller gate but failed at private source checkout
  before request validation or provider login. GitHub's caller token cannot
  clone a separate private source repository.
- A corrected optional `PICA_SOURCE_TOKEN` path was added for maintainer-only RC
  validation; normal use after the source is public falls back to
  `github.token`.
- Persisting the current broad GitHub CLI token was rejected as unsafe. No token
  was written. Final private-caller content validation therefore remains
  pending a fine-grained contents-read token or the later public-source state.

No second provider run was triggered and no private caller artifact exists yet.
