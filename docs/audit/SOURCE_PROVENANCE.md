# Source Provenance

## Upstream-derived

The provider transport, request signing, Pica API types/client, pagination,
picture transfer, proxy support, `.part` download behavior and selected legacy
tests originated in the MIT-licensed `justorez/pica-cli` project by Neo. The clean
import used frozen SHA `9a8448a49062f22c367fdea1dc10e3acf53fde1d` without copying Git history.

## Refactored

The upstream download client is retained behind `LibraryService`. Existing
favorite/search/episode/picture calls now feed persistent models, the shared queue,
local runner and GitHub workflow. Package identity, binary output, build and CI were
changed to `pica-library`.

## Newly implemented

Canonical library data, author identity review and merge, explainable recommendation,
SQLite migrations, lifecycle tables, queue state machine, global scheduler, update
findings, repair scan, safe templates, Bundle validation, artifact contract, local
API, five-area Web IA and audit documentation are Pica Library additions.

The original MIT copyright notice remains in `LICENSE`; this document does not claim
copyright transfer or abandonment by upstream authors.
