# Desktop ↔ Android Pairing and Account-State Sync V1

Status: development baseline; paired account state and Desktop-backed Pica relay are implemented, credential handoff remains intentionally disabled.

## Goals

- Pair Android with Desktop without typing the LAN address and six-digit code manually.
- Reuse the existing `picalibrary://pair?host=...&code=...` deep-link contract.
- Keep account connection state consistent after pairing so the phone does not unnecessarily ask the user to log in again for Desktop-backed features.
- Preserve local-first behavior and never send provider credentials to a third-party QR service.

## Implemented in this pass

### Local QR pairing

Desktop builds the pairing deep link locally and renders a QR code with the vendored MIT-licensed `qrcodejs` implementation.

The QR contains only:

- the current LAN Mobile Bridge address;
- the current short-lived six-digit pairing code.

The QR is generated in the browser. No QR payload is sent to an external web API.

Android already understands the `picalibrary://` deep link and automatically fills the Desktop address and pairing code before invoking the normal pairing operation.

### Paired account state

After bearer-token pairing, Android requests:

`GET /mobile/v1/accounts/status`

The response contains non-secret state only:

- whether Desktop has a configured Pica account;
- whether Desktop has a configured E-H session;
- that Desktop is the authority for this mirrored state.

Android caches these booleans and shows statuses such as **已由 Desktop 连接**.

No account identifier, password, API token, E-H cookie, GitHub credential, or WebDAV secret is returned.

## Desktop-backed Pica relay

When Android is paired, has no phone-local Pica account, and the mirrored Desktop account state says Pica is configured, Android can use the existing authenticated Mobile Bridge as a provider relay.

Current relay coverage includes:

- Pica search and category/tag browse;
- favorites listing;
- leaderboard and related works;
- comic metadata;
- chapter and page metadata;
- favorite add/remove mutation using Desktop's existing idempotent confirmation logic;
- online reader and Android recommendation code paths through the shared `PicaClient` fallback.

The local phone account remains higher priority. If a phone-local Pica session exists, Android keeps using it directly and does not route ordinary Pica requests through Desktop.

The relay sends provider results and user-requested actions over the paired bridge. It does **not** send the Pica email, password, provider authorization token, E-H cookies, or other long-lived provider credentials to Android.

If Desktop is offline, relay calls fail closed. A phone-local Pica account remains the optional offline/direct-provider path.

## Why credentials are not copied yet

The current Mobile Bridge is a LAN HTTP transport protected by a random bearer pairing token. That is sufficient for the existing local library/reader contract, but it is not an acceptable channel for automatically copying long-lived provider secrets.

Therefore V1 deliberately synchronizes **connection state**, not passwords/cookies.

For Desktop-backed recommendation, library, reader and other paired features, the phone should use Desktop state and should not force a second login. If the user wants the phone to contact a provider directly while Desktop is offline, a phone-local provider session is still required until the secure relay/handoff phase is complete.

## Next security phase

Do not invent a proprietary secret-transfer protocol.

Use established open-source pairing patterns as design references:

- Syncthing: explicit device identity and mutually approved device pairing.
- LocalSend: LAN discovery plus encrypted transport and certificate/fingerprint verification.

The preferred end state is:

1. QR pairing establishes the Desktop identity and short-lived bootstrap secret.
2. The paired channel is upgraded to authenticated encrypted transport.
3. Desktop remains the primary account authority.
4. Android uses the implemented Desktop Pica provider relay while Desktop is reachable, avoiding duplicate Pica login; equivalent account-required E-H/ExH relay coverage remains a later security/product phase.
5. Only if offline direct-provider access is explicitly requested should a revocable encrypted session handoff be considered.
6. Provider passwords should not be replicated merely for convenience.

## Data preservation

Pairing/account-state metadata is additive. It does not rewrite recommendation behavior history, the library database, downloads, or existing Android local account stores.
