# Performance Test Plan

**NOT YET BENCHMARKED.** No real Pica download performance improvement is claimed.

Use `pnpm benchmark small|medium|large` only to validate the measurement output
contract. It is synthetic and does not measure network performance.

For each real test, run both Local and GitHub runners with small (1-5 comics), medium
(one favorites page / up to 20 comics), and large (multiple reviewed batches) plans.
Use the same comic IDs, episode selection and Balanced profile where possible.
Record wall time, downloaded bytes, throughput, success rate, retry count, failure
count and GitHub artifact upload time. Repeat three times, report medians and ranges,
and separately document network route, proxy status, runner region and provider rate
limits. Stop on 429 or provider restrictions; do not tune to evade limits.

Conservative, Balanced and Fast profiles are centralized in
`src/core/downloads/profiles.ts`. Custom values must remain within CLI/server caps.
