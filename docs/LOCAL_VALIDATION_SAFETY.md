# Local validation safety — user-visible security prompts

User instruction, 2026-10-23: repeated Windows security prompts asking permission for Java/other validation runtimes are disruptive. Control the validation workflow instead of asking the user to keep allowing them.

## Effective immediately

- Do not launch local Java/Gradle/apksig/JM worker processes, downloaded Windows application copies, LAN/Mobile Bridge listeners, or full/incremental upgrade runtime matrices by default. This includes copies extracted into fresh random temporary paths.
- Run those builds, signing verification and executable/networked artifact gates on the already-authorized isolated GitHub Actions/Draft workflow. Keep exact-source artifact digests and raw CI evidence. Do not relabel CI evidence as an independent local runtime or physical-device test.
- Local work may continue with source inspection, TypeScript/Web syntax checks and specifically selected tests verified not to launch Java, a packaged application, an OS permission prompt or a LAN listener. Inspect the chosen test closure first; do not default to the whole test suite or old handoff reproduction drivers.
- If an indispensable local permission-sensitive check remains, explain the exact executable/path/purpose first and obtain specific user direction. Existing broad candidate-build permission does not override this new local-execution restriction.
- Never automatically accept security dialogs, add firewall/antivirus allow rules, disable protection, change network profiles, grant broad executable trust, or kill unrelated Java/user applications to make tests pass.
- Only stop task-owned processes after checking exact executable/parent/validation-root ownership. Preserve user data, production applications and previous immutable handoffs.

## Evidence and limits

A read-only process snapshot found zero `java.exe`/`javaw.exe`/`javac.exe` processes and zero Node command lines matching the current audit/shadow validation drivers. Firewall events contained multiple paths under the task's prior `_validation/recommendation-audit-module-20261023/smoke-temp` application copies, including `runtime/node.exe`. This confirms local artifact execution affected the firewall notification surface; it does not establish that every reported dialog was Java or identify the exact wording of an unseen dialog.

The earlier immutable NEXT-59 package/results remain unchanged. NEXT-60 source changes are still in progress; no new installation, deployment, release, broad permission or runtime acceptance is implied by this workflow adjustment. Residual dialogs can be cancelled; continued prompts require identifying their actual application/path, not assuming they are safe.
