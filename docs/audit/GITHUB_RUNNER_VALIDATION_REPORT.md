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
- Persisting the current broad GitHub CLI token was rejected as unsafe and no
  token was written. A repository-scoped, read-only deploy key was used instead.
- Corrected run:
  <https://github.com/Saber-Alter-Lily/pica-library-runner/actions/runs/31627546675>.
- Private gate, immutable engine checkout, request validation, provider
  download, artifact build, and artifact upload all passed.
- Result: `GITHUB`, `COMPLETED`, 30 media files, 12,183,916 bytes, zero retries,
  zero empty files, zero stale `.part` files, and no artifact error manifest.
- The one-day artifact belongs to the PRIVATE caller repository run.
- Artifact text scan found no password/token/Authorization/Cookie/API-key
  fields or bearer-like values.
- The temporary deploy key, companion private-key Secret, and local private-key
  directory were all removed immediately after validation. Only the two Pica
  credential Secret names remain in the PRIVATE companion.
