# Public Runner Privacy Report

Status: implementation complete. The first private-source validation reached
the private caller gate but exposed GitHub's separate source-checkout permission
boundary before any provider request. A temporary read-only source token is used
only for the corrected RC validation.

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
