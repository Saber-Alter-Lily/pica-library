# JM explicit-connection route: virtual boundary validation

Continuation of local `0d8dc49713e7400f9c53b57b592212759b1fc72f`, not a new installable or a modification of PR207. The same human-authorized isolated scope applies; no push, live source/account, listener, Java, application or production profile is used.

## What actually executes

`test/unit/jm-virtual-routing.test.ts` uses the existing TypeScript compiler to extract the unmodified `http.createServer` callback plus `json`/`body` helpers, and the three real JM LibraryService adapter methods. Those functions execute in a VM with only controlled collaborators. EventEmitter requests/replies and a fake JM transport exercise the real request dispatch, host/origin/CSRF gates, JSON parsing, service dispatch and source lease behavior. Neither `http.createServer`, `startLibraryServer`, service/profile/cache initialization nor a socket is executed.

GET remains passive, authorized POST uses the real remembered-login adapter, unauthorized commands reject before body consumption, unknown body fields/types cannot connect, and disabling a source while a fake reply is pending rejects the late identity. HTTP methods do not accidentally grant command authority. These are actual code-path tests, not copies of the authorization logic or source-substring-only evidence.

## Counterexamples and bounded correction

The first26-case target was developed from24 virtual cases:21 passed and3 failed. They established malformed JSON returning500, a non-JSON media type reaching connect, and an oversize command following the general request reader. Only this connect action now requires JSON, limits parsing to4096bytes and returns constant errors without parser/input reflection. Login/logout/favorite routes retain their previous path.

An additional real in-memory Node Readable exposed another issue: early body-reader rejection destroyed the stream before the error reply could finish (24pass/1fail preserved). The reader has a false-by-default opt-in to use native `iterator({destroyOnReturn:false})`; only the JM connect command opts in. Invalid/oversize commands request `Connection: close`, allowing the HTTP owner to close after sending the response. A separate counterexample verifies that ordinary reader calls keep their prior destruction behavior.

This reuses [Node's documented readable iterator](https://nodejs.org/docs/latest-v22.x/api/stream.html#readableiteratoroptions), available since16.3; it does not add a parser, stream framework or dependency. The packaged Node version remains24.15.0 and declared floor remains>=22.5. No claim is made that a physical TCP response or every supported Node version was exercised locally.

The first134 runtime assertions passed but strict types caught a contextual `this` issue in the fake request iterator. An explicit generator closure fixes that test scaffold without changing product behavior or expectations. The final target is135 assertions/18suites: the prior109 plus26 virtual/Node-stream cases. Exact committed-source counts/hashes are recorded in the separate handoff; development results are not borrowed as cloud CI.

## Remaining acceptance

Actual Node HTTP framing/socket close behavior, real browser UI, packaged runtime, Android/signature/upgrade, source credentials/interoperability and physical-device experience remain pending. The existing live HTTP test has been expanded for CI, but has not run on the user's PC. Previous109-test source evidence and the PR207 Windows/Dev83 candidate stay immutable. This is progress on explicit source ownership, not proof that arbitrary extensions/native/sync or the entire local-first modular reader goal are complete.
