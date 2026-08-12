# Public Runner Privacy Report

Status: implementation and private-caller live validation complete. The first
private-source validation reached the private caller gate but exposed GitHub's
separate source-checkout permission boundary before any provider request. The
corrected validation used a temporary repository-scoped read-only deploy key,
then revoked it immediately.

## Boundary

- `.github/workflows/private-download.yml` is callable with `workflow_call`.
- The job refuses execution unless the caller repository reports
  `github.event.repository.private == true`.
- The check runs before source checkout, credential validation, provider login,
  download, or artifact upload.
- The engine source is checked out from `job.workflow_repository` at immutable
  `job.workflow_sha`, not from the caller checkout context.
- Normal public-source callers pass only named `PICA_ACCOUNT` and
  `PICA_PASSWORD` secrets. Temporary optional source credentials exist only so
  maintainers can validate cross-repository checkout before the source is
  public. A repository-scoped, read-only `PICA_SOURCE_SSH_KEY` deploy key is
  preferred and is removed after validation.
- Artifact retention is one day and the artifact belongs to the caller run.
- The source repository's manual wrapper calls the same guarded engine, so it
  automatically fails closed if the source repository is public.

## Evidence

`test/unit/workflow-entrypoint.test.ts` asserts the visibility gate, reusable
workflow trigger, pinned engine checkout, and retention. The runner artifact
test asserts shared `runner=GITHUB` output semantics.

The design follows GitHub's documented reusable-workflow semantics: `github`
context and hosted-runner assignment use the caller context, while an explicit
`job.workflow_repository` and `job.workflow_sha` identify the called workflow's
own repository and immutable revision.

Live validation run `31627546675` completed in the PRIVATE companion repository,
produced a one-day private artifact, and passed manifest/media/secret scans. The
temporary source deploy key, private-key Secret, and local key files were removed
afterward. Once the source repository is public, normal callers require only
their two Pica credential Secrets and the checkout falls back to the caller's
standard token.
