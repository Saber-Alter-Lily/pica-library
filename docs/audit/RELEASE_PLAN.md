# Private RC2 Release Plan

This candidate is review-only. The repository remains PRIVATE. No tag, GitHub
Release, production Pages deployment, npm/Docker publication, merge to main or
public announcement is authorized by this plan.

Before any future source-repository visibility change to PUBLIC, the maintainer
must first confirm the private companion/caller path remains valid and remove
the source repository Actions secrets named `PICA_ACCOUNT` and `PICA_PASSWORD`.
User download credentials belong only in a PRIVATE caller repository after that
transition. Re-run the workflow privacy gate and a secret-name inventory before
changing visibility.

Any code or tracked documentation change after the RC2 freeze invalidates its
exact SHA, CI evidence, private-caller evidence, patch and review package. A new
candidate must repeat those gates.
