# Release Readiness

`READY_FOR_REVIEW`

The candidate passed 64/64 local tests and all push/pull-request GitHub CI jobs on
Node 22 and Node 24 at tested code SHA
`ca33dcc3a8409adfd4b330e63ee76c161634ca3a`. It is suitable for private
human/ChatGPT review but is not approved for release.

Remaining release blockers:

- `MANUAL_PENDING_AFTER_PRIVATE_MAIN_MERGE`: live provider test with maintainer-owned credentials.
- `MANUAL_PENDING_AFTER_PRIVATE_MAIN_MERGE`: live manual GitHub Runner download/artifact test.
- Explicit future authorization for merge, visibility, release, Pages and package publication decisions.

No merge, release, tag, npm publication, GitHub Release, Pages deployment or public
visibility change is part of this candidate.
