# Source-owned media, local content and the next ingestion boundary

## Implemented in NEXT-47 (unpublished)

`HttpMediaClient` extracts the existing Axios media logic from the Pica SDK into `src/media`. It has no account session, cookie jar, library, recommendation or database dependency. Pica retains its API/account adapter and delegates image/download HTTP to this shared component. JM public covers use it directly, without Pica credentials, JM login or a JVM request. E-H retains its own adapter because its page/session semantics differ. `ProviderService.fetchCover` chooses the owning compiled source, never a catch-all Pica login.

This reuses the installed [Axios request configuration](https://axios-http.com/docs/req_config) and [AbortController support](https://axios-http.com/docs/cancellation), not a parallel HTTP implementation or another SDK. Strict cover/image reads retain HTTPS, URL userinfo/localhost/private-IP-literal rejection, every-hop URL validation, at most five redirects, body size and raster MIME limits. A 20-second total redirect-chain deadline uses both request timeout and standard AbortSignal for connection/response cancellation. Axios API/header/auth defaults are not inherited; configured proxy credentials are only proxy configuration and sanitized errors do not return Axios config. JM reads current proxy settings on each cover operation. Legacy download-only insecure HTTP opt-in remains explicit; covers do not inherit it.

The existing URL policy is syntax/IP-literal validation, **not a DNS-rebinding sandbox or a permission model for untrusted executable plugins**. No such security acceptance is claimed. Dynamic extension trust and stronger egress isolation remain separate required work.

Cover cache identity now includes the owning source's account/session scope, not the unrelated Pica account. Existing cache files without that fingerprint refresh once. One per-comic promise chain serializes writers, and both disk-cache reads and new responses recheck source identity after asynchronous work. Switched-account/source responses reject before returning/caching stale bytes. Only a hash, never raw accounts, sessions or URLs, is stored in cache metadata. Persistence remains a Library adapter, not an ownership claim by the media transport.

Evidence: synthetic adapter tests, the actual loopback HTTP cover API, no-account/no-JVM operation, proxy/error/type/size/redirect/timeout checks, concurrent writers and account changes during network/disk reads. `test-windows-source-media.mjs` runs the actual Windows archive with empty Pica credentials and a bounded loopback proxy that serves one synthetic PNG and one deliberately stalled response; all other remote requests are rejected. The actual backend must terminate the stall, not just report a configured timeout. A fixture response is not real CDN/provider availability or a representative performance-budget measurement.

## Local ingestion continuation (not implemented or advertised yet)

The inspected [Mihon local-source guide](https://mihon.app/docs/guides/local-source/) organizes user media as series → chapter folders/archives → pages. Borrow that understandable structure, not its implementation or its full format-support list. Our existing local Reader already serves downloaded page records safely under the library root, saves progress and exports ZIP/CBZ; it does not yet ingest arbitrary user folders/archives.

Required next work:

1. Introduce source-independent `local:` identities and local provenance without disguising records as Pica. Audit provider filters, catalog import/export, tags, Reader, paired catalog and Android parsing before enabling them. Existing CSV currently omits provider/cover metadata; do not use that lossy format as the new ingestion authority.
2. Preview a selected user folder/CBZ as a library item with chapter/page inventory, deterministic natural order and bounded counts/sizes. No automatic disk scan or source-account requirement. Reuse the installed ZIP library with explicit traversal/symlink/encryption/entry-size/total-size checks; never trust filenames or decompressed size claims alone.
3. Explicit confirm copies verified images into the library-owned media root, atomically commits metadata and records content hashes. Keep the original input untouched. Roll back a failed import; do not create partly visible completed chapters.
4. Reimport preserves stable chapter/page identity and reading progress, detects replacements/missing files and does not silently overwrite favorites, private tags or feedback. Removal distinguishes library copy from original file and remote-source deletion.
5. Add real folder/CBZ fixture Reader and Mobile Bridge tests; retain CBR/PDF/EPUB capability false until actually supported. Source optionality and existing one-click full/incremental recovery gates remain required.

This is a continuation contract, not a claim that local import or the complete modular-reader objective is finished. No production profile, official release/OTA, provider account or deployment is used.
