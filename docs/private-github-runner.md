# Private GitHub Runner

The download engine is reusable, but content runs must belong to a private
caller repository. GitHub evaluates the reusable workflow's `github` context
and hosted runner in the caller context, so its one-day artifact remains on the
private caller run.

## Setup

1. Create a private repository. Do not commit credentials or downloaded files.
2. Add repository secrets named `PICA_ACCOUNT` and `PICA_PASSWORD`.
3. Copy the workflow below to `.github/workflows/download.yml`.
4. Replace `ENGINE_SHA` with an immutable reviewed commit SHA from Pica Library.
5. Open Actions, choose `private-pica-download`, and run a small request first.

While the engine source itself is still private during maintainer RC validation,
an additional temporary read-only `PICA_SOURCE_TOKEN` may be required for source
checkout. This is not needed after the engine repository becomes public and is
not part of the normal user setup.

```yaml
name: private-pica-download

on:
  workflow_dispatch:
    inputs:
      comic_ids:
        description: 'Comma-separated comic IDs (maximum 20)'
        required: true
        type: string
      episodes:
        description: 'Episodes, for example all or 1,3,5-10'
        required: true
        default: 'all'
        type: string
      profile:
        required: true
        default: balanced
        type: choice
        options: [conservative, balanced, fast]

permissions:
  contents: read

jobs:
  download:
    uses: Saber-Alter-Lily/pica-library/.github/workflows/private-download.yml@ENGINE_SHA
    with:
      mode: comic_ids
      comic_ids: ${{ inputs.comic_ids }}
      episodes: ${{ inputs.episodes }}
      profile: ${{ inputs.profile }}
    secrets:
      PICA_ACCOUNT: ${{ secrets.PICA_ACCOUNT }}
      PICA_PASSWORD: ${{ secrets.PICA_PASSWORD }}
      # RC maintainers only while the engine source is private:
      # PICA_SOURCE_TOKEN: ${{ secrets.PICA_SOURCE_TOKEN }}
```

The engine fails before checkout, credential validation, provider login, or
artifact creation when `github.event.repository.private` is not `true`.
Artifacts use one-day retention. Do not redistribute downloaded material.

## Why the explicit SHA matters

GitHub supports branch, tag, or SHA references for reusable workflows and
recommends a commit SHA for the strongest stability and security. The called
workflow explicitly checks out `job.workflow_repository` at `job.workflow_sha`;
ordinary checkout in a reusable workflow would otherwise select the caller
repository.

References:

- [Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [Reusable workflow context and runners](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)
