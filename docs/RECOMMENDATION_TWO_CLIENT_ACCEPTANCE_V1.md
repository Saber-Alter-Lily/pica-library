# Windows + Android Recommendation Independence Acceptance V1

Status: candidate-test checklist. This is not a release/promotion gate for Recommendation V5 quality.

## Preconditions

- Upgrade the existing Windows test installation without deleting its data directory.
- Upgrade Android in place; do not uninstall first.
- Pair the two clients on the same LAN.
- Keep at least one existing Desktop recommendation cycle and one Android-local recommendation cycle available for comparison.

## A. Runtime independence

1. Record the current Desktop cycle/batch.
2. Record the current Android cycle/batch.
3. On Android choose “重新生成手机推荐”.
4. PASS if Android gets a new local cycle and the Desktop current cycle does not change.
5. On Desktop regenerate recommendations.
6. PASS if Desktop changes independently and the Android current cycle is not replaced.

## B. Session isolation

1. On Android set “本次想看” for a visible author/tag.
2. Confirm Android profile says the Session is local-only.
3. Connect/sync.
4. PASS if Desktop does not inherit that Session Intent.
5. Set a Desktop Session target and reconnect.
6. PASS if Android does not inherit the Desktop Session target and no sync prompt is caused only by that Session change.

## C. Persistent 1–10 preference sync

1. Pick an interest with a visible baseline.
2. Change it on Android and confirm Android ranking/profile changes locally before sync.
3. Sync.
4. PASS if Desktop receives the persistent adjustment.
5. Change the same preference differently on both clients after a common sync.
6. Reconnect.
7. PASS only if a conflict is shown and the user can explicitly choose Desktop or Android; no average/timestamp winner is silently chosen.

## D. Recommendation item semantics

From an Android recommendation card or detail screen verify:

- Like / Dislike;
- “已经看过”;
- “已经拥有”;
- “重复上传”;
- “暂时不想看（30 天）”;
- BLOCK author;
- for a favorite: “保留收藏，但不用于推荐口味”.

PASS if these are represented separately, take local effect immediately, and appear as syncable changes. A semantic disposition must not silently become a Dislike.

## E. Lifetime / Recent / Session profile

Android profile must separately show:

- long-term primary interests;
- recent 30-day behavior interests;
- current Android Session interests;
- current Android recommendation composition / reasons.

PASS if current Session evidence changes from phone use without becoming Desktop Session state after sync.

## F. Portable candidate reservoir

1. Sync the recommendation foundation while Desktop is online.
2. Confirm Android shows a reservoir generation/count.
3. Disconnect Desktop while keeping Android local data.
4. Generate/re-rank Android recommendations.
5. PASS if Android can use the cached reservoir and its own policy/Recent/Session state without requesting a Desktop recommendation batch.

Provider discovery of brand-new candidates may be reduced when neither a phone-local provider session nor Desktop relay is available; this is not a failure of runtime independence.

## G. Visual portability

1. Desktop performs/owns heavy Visual preprocessing.
2. Sync foundation.
3. Android shows Visual generation and candidate coverage.
4. Android default is SHADOW.
5. Switch Android Visual mode locally between OFF / SHADOW / LIVE.
6. PASS if the switch only affects Android; Desktop Visual mode remains unchanged.
7. PASS if Android never performs a DINOv2/full-corpus embedding rebuild.

## H. Canonical Work identity

After foundation sync, Android receives Work/Edition bindings.

PASS if:
- a candidate whose canonical work is already owned is not recommended as a new work;
- multiple uploads bound to the same canonical work do not occupy multiple Android recommendation slots unless explicitly distinct.

## I. Connection/reconnect UX

1. Reconnect with no portable divergence.
2. PASS if no intrusive sync dialog appears.
3. Make a durable change on either side and reconnect.
4. PASS if Android shows a concise change summary and offers 双向同步 / 查看详情 / 稍后.
5. Repeat pairing the same phone.
6. PASS if only one stable paired-device entry remains and the previous token is revoked.

## J. Provider relay / credentials

With Desktop logged in and Android without a local provider account:

- Pica account-required operations work through Desktop relay.
- E-H/ExH account-required operations work through Desktop relay.
- public E-H can still work directly.

PASS only if no Pica password/token or E-H cookie/session secret is transferred into the recommendation sync package.

## K. Data preservation

After both upgrades verify existing:

- favorites/library;
- downloads;
- shelves;
- reading history;
- recommendation feedback/history;
- prior Desktop user_events;
- Android local recommendation state where compatible.

The acceptance build must not require deleting the Windows data directory or uninstalling Android.

## Non-goals for this acceptance

This test does **not** claim V5 recommendation quality is better than current serving and does not authorize LTR/Bandit/Active Learning or formal release/promotion.
