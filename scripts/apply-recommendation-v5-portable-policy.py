from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path: str, old: str, new: str, count: int = 1):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'PATCH_MISS {path}: {old[:120]!r}')
    if count == 1 and text.count(old) != 1:
        raise SystemExit(f'PATCH_AMBIGUOUS {path}: {text.count(old)} matches')
    target.write_text(text.replace(old, new, count), encoding='utf-8')

# Desktop service: portable policy API + ranking integration.
patch(
    'src/library/service.ts',
    "import {\n    loadTagRegistryV3,\n    resolveTagV3\n} from '../recommendation-v3/tag-resolution-v3'\n",
    "import {\n    loadTagRegistryV3,\n    resolveTagV3\n} from '../recommendation-v3/tag-resolution-v3'\nimport {\n    RecommendationPolicyStoreV5,\n    type MobileRecommendationSyncV5\n} from '../recommendation-v5/policy-store'\nimport {\n    filterCandidatesAgainstOwnedV5,\n    preferenceAdjustmentV5\n} from '../recommendation-v5/portable-policy'\n"
)
patch(
    'src/library/service.ts',
    "    recordRecommendationEvent(input: UserEventInput) {\n        return this.database.recordUserEvent(input)\n    }\n\n    visualSettings() {",
    "    recordRecommendationEvent(input: UserEventInput) {\n        return this.database.recordUserEvent(input)\n    }\n\n    recommendationV5Snapshot() {\n        return new RecommendationPolicyStoreV5(this.database).snapshot()\n    }\n\n    updateRecommendationV5Control(input: Record<string, unknown>) {\n        return new RecommendationPolicyStoreV5(this.database).setControl({\n            targetType: input.targetType,\n            key: input.key,\n            label: input.label,\n            direction: input.direction,\n            scope: input.scope,\n            source: 'DESKTOP'\n        })\n    }\n\n    updateRecommendationV5Session(input: Record<string, unknown>) {\n        return new RecommendationPolicyStoreV5(this.database).setSessionIntent({\n            mode: input.mode,\n            targetType: input.targetType,\n            key: input.key,\n            label: input.label,\n            source: 'DESKTOP'\n        })\n    }\n\n    suppressRecommendationV5Comic(input: Record<string, unknown>) {\n        return new RecommendationPolicyStoreV5(this.database).suppressComic(\n            String(input.comicId ?? ''),\n            input.suppressed !== false\n        )\n    }\n\n    mergeMobileRecommendationV5(input: MobileRecommendationSyncV5) {\n        return new RecommendationPolicyStoreV5(this.database).mergeMobile(input)\n    }\n\n    visualSettings() {"
)
patch(
    'src/library/service.ts',
    "        const catalog = this.database.listComics({ limit: 10000 })\n        const readingIds = new Set(this.database.readingProgress().map((item) => item.comicId))",
    "        const catalog = this.database.listComics({ limit: 10000 })\n        const recommendationV5Store = new RecommendationPolicyStoreV5(this.database)\n        const recommendationV5State = recommendationV5Store.state()\n        const readingIds = new Set(this.database.readingProgress().map((item) => item.comicId))"
)
patch(
    'src/library/service.ts',
    "        const ranked = rankCandidatesWithFrozenRankerV3({\n            candidates: retrieved.candidates,",
    "        const v5Filtered = filterCandidatesAgainstOwnedV5(\n            retrieved.candidates,\n            catalog,\n            recommendationV5State\n        )\n        const ranked = rankCandidatesWithFrozenRankerV3({\n            candidates: v5Filtered.rows,"
)
patch(
    'src/library/service.ts',
    "            .map(({ __feedbackRankScore: _score, ...candidate }) => candidate)\n        this.recommendationProgress = {",
    "            .map(({ __feedbackRankScore: _score, ...candidate }) => candidate)\n        const policyAdjusted = feedbackAdjusted\n            .map((candidate, index) => {\n                const policy = preferenceAdjustmentV5(\n                    candidate.comic,\n                    recommendationV5State\n                )\n                const baselinePercentile =\n                    feedbackAdjusted.length <= 1\n                        ? 1\n                        : 1 - index / (feedbackAdjusted.length - 1)\n                return {\n                    ...candidate,\n                    v5Adjustment: policy.adjustment,\n                    v5Reasons: policy.reasons,\n                    __v5RankScore: baselinePercentile + policy.adjustment\n                }\n            })\n            .filter((candidate) => !preferenceAdjustmentV5(candidate.comic, recommendationV5State).blocked)\n            .sort(\n                (a, b) =>\n                    b.__v5RankScore - a.__v5RankScore ||\n                    a.rawRank - b.rawRank ||\n                    a.comicId.localeCompare(b.comicId)\n            )\n            .map(({ __v5RankScore: _score, ...candidate }) => candidate)\n        this.recommendationProgress = {"
)
patch(
    'src/library/service.ts',
    "        const reranked = rerankWithVisualStyle({\n            ranked: feedbackAdjusted,",
    "        const reranked = rerankWithVisualStyle({\n            ranked: policyAdjusted,"
)
patch(
    'src/library/service.ts',
    "                cycleId,\n                recommendationV4: {",
    "                cycleId,\n                recommendationV5: {\n                    policyVersion: recommendationV5State.policyVersion,\n                    revision: recommendationV5State.revision,\n                    controlCount: recommendationV5State.controls.length,\n                    hardSuppressCount:\n                        recommendationV5State.hardSuppressComicIds.length,\n                    ownedOrDuplicateRemoved:\n                        v5Filtered.telemetry.exactOrOwnedRemoved +\n                        v5Filtered.telemetry.workDuplicateRemoved,\n                    workDuplicateRemoved:\n                        v5Filtered.telemetry.workDuplicateRemoved,\n                    hardBlockedRemoved:\n                        v5Filtered.telemetry.hardBlockedRemoved,\n                    policyAdjustedCount: policyAdjusted.filter(\n                        (item) =>\n                            Number(\n                                (item as { v5Adjustment?: number })\n                                    .v5Adjustment ?? 0\n                            ) !== 0\n                    ).length\n                },\n                recommendationV4: {"
)

# Final V3 coordinator: recheck current owned/block state before allocation AND before serving cached batches.
patch(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "} from './batch-allocator-v3'\n",
    "} from './batch-allocator-v3'\nimport { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'\nimport { filterCandidatesAgainstOwnedV5 } from '../recommendation-v5/portable-policy'\n"
)
patch(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "        const exhausted =\n            batch.itemIds.length === 0 || pool?.telemetry.state === 'EXHAUSTED'\n        return {",
    "        const catalog = this.database.listComics({ limit: 10000 })\n        const policy = new RecommendationPolicyStoreV5(this.database).state()\n        const serving = filterCandidatesAgainstOwnedV5(\n            this.database.recommendationRecords(batch.itemIds),\n            catalog,\n            policy\n        )\n        const exhausted =\n            serving.rows.length === 0 || pool?.telemetry.state === 'EXHAUSTED'\n        return {"
)
patch(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "            recommendations: this.database.recommendationRecords(batch.itemIds),\n            evidence: batch.evidence,",
    "            recommendations: serving.rows,\n            servingFilteredCount:\n                batch.itemIds.length - serving.rows.length,\n            servingFilterTelemetry: serving.telemetry,\n            evidence: batch.evidence,"
)
patch(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "        const favoriteIds = new Set(\n            [...catalog.values()]\n                .filter((comic) => comic.isFavorite)\n                .map((comic) => comic.comicId)\n        )\n        const allocated = allocateRecommendationBatchV3({\n            ranked,",
    "        const favoriteIds = new Set(\n            [...catalog.values()]\n                .filter((comic) => comic.isFavorite)\n                .map((comic) => comic.comicId)\n        )\n        const policy = new RecommendationPolicyStoreV5(this.database).state()\n        const eligibleRanked = filterCandidatesAgainstOwnedV5(\n            ranked,\n            [...catalog.values()],\n            policy\n        ).rows\n        const allocated = allocateRecommendationBatchV3({\n            ranked: eligibleRanked,"
)

# Desktop HTTP API for recommendation control center.
patch(
    'src/library/server.ts',
    "            if (\n                url.pathname === '/api/v1/recommendation-events' &&\n                request.method === 'POST'\n            ) {",
    "            if (\n                url.pathname === '/api/v1/recommendation-v5' &&\n                request.method === 'GET'\n            )\n                return json(response, 200, options.service.recommendationV5Snapshot())\n\n            if (\n                url.pathname === '/api/v1/recommendation-v5/control' &&\n                request.method === 'POST'\n            ) {\n                const input = await body(request)\n                return json(\n                    response,\n                    200,\n                    options.service.updateRecommendationV5Control(input)\n                )\n            }\n\n            if (\n                url.pathname === '/api/v1/recommendation-v5/session' &&\n                request.method === 'POST'\n            ) {\n                const input = await body(request)\n                return json(\n                    response,\n                    200,\n                    options.service.updateRecommendationV5Session(input)\n                )\n            }\n\n            if (\n                url.pathname === '/api/v1/recommendation-v5/suppress' &&\n                request.method === 'POST'\n            ) {\n                const input = await body(request)\n                return json(\n                    response,\n                    200,\n                    options.service.suppressRecommendationV5Comic(input)\n                )\n            }\n\n            if (\n                url.pathname === '/api/v1/recommendation-events' &&\n                request.method === 'POST'\n            ) {"
)

# Mobile bridge sync: Desktop snapshot + dirty phone mutations.
patch(
    'src/mobile/bridge-server.ts',
    "            if (\n                url.pathname === '/mobile/v1/visual/status' &&\n                request.method === 'GET'\n            ) {",
    "            if (\n                url.pathname === '/mobile/v1/recommendation/v5/snapshot' &&\n                request.method === 'GET'\n            )\n                return json(\n                    response,\n                    200,\n                    options.service.recommendationV5Snapshot()\n                )\n\n            if (\n                url.pathname === '/mobile/v1/recommendation/v5/sync' &&\n                request.method === 'POST'\n            ) {\n                const input = await body(request, 512 * 1024)\n                return json(\n                    response,\n                    200,\n                    options.service.mergeMobileRecommendationV5(input)\n                )\n            }\n\n            if (\n                url.pathname === '/mobile/v1/visual/status' &&\n                request.method === 'GET'\n            ) {"
)

# Web loads the V5 control-center enhancement without changing the existing V3/V4 app shell.
patch(
    'web/index.html',
    '        <script type="module" src="./eh-account.js"></script>\n',
    '        <script type="module" src="./eh-account.js"></script>\n        <script type="module" src="./recommendation-v5-beta.js"></script>\n'
)

# Android bridge: sync dirty local controls/feedback, cache Desktop current batch, then use it offline.
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java',
    "    static JSONObject visualStatus(Context c) throws Exception {return new JSONObject(get(c,\"/mobile/v1/visual/status\"));}\n",
    "    static JSONObject syncRecommendationState(Context c) throws Exception {JSONObject response=new JSONObject(post(c,\"/mobile/v1/recommendation/v5/sync\",RecommendationPolicyStore.syncPayload(c)));RecommendationPolicyStore.acknowledge(c,response);RecommendationBatch desktop=recommendationBatch(c,12);if(!desktop.items.isEmpty()){NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=\"desktop-sync-\"+System.currentTimeMillis();snapshot.generatedAt=java.time.Instant.now().toString();snapshot.readiness=\"DESKTOP_SYNCED\";snapshot.candidateCount=desktop.items.size();snapshot.batchIndex=0;List<NativeRecommendationStore.Item> items=new ArrayList<>();for(RecommendationItem item:desktop.items)items.add(new NativeRecommendationStore.Item(item.id,item.title,item.author,item.reason,\"DESKTOP\",\"\",0));snapshot.batches.add(items);NativeRecommendationStore.save(c,snapshot);}return response;}\n    static JSONObject recommendationPolicy(Context c) throws Exception {return new JSONObject(get(c,\"/mobile/v1/recommendation/v5/snapshot\"));}\n    static JSONObject visualStatus(Context c) throws Exception {return new JSONObject(get(c,\"/mobile/v1/visual/status\"));}\n"
)
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java',
    "BridgeStore.save(this,h,token,name);try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}SupporterSyncJobs.enqueue(this);",
    "BridgeStore.save(this,h,token,name);try{BridgeClient.syncRecommendationState(this);}catch(Exception ignored){}try{ShelfStore.syncWithDesktop(this);}catch(Exception ignored){}SupporterSyncJobs.enqueue(this);"
)

# Android settings entry and manifest for portable controls.
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java',
    "content.addView(SettingsRow.row(this,\"反馈原因\",reasons?\"开启\":\"关闭\",v->{RecommendationFeedbackStore.setAskReasons(this,!RecommendationFeedbackStore.askReasons(this));renderContent();}));LinearLayout info=SettingsRow.panel(this,null);",
    "content.addView(SettingsRow.row(this,\"反馈原因\",reasons?\"开启\":\"关闭\",v->{RecommendationFeedbackStore.setAskReasons(this,!RecommendationFeedbackStore.askReasons(this));renderContent();}));content.addView(SettingsRow.row(this,\"推荐偏好控制\",\"电脑主计算 · 手机离线轻量更新\",v->startActivity(new Intent(this,RecommendationControlActivity.class))));LinearLayout info=SettingsRow.panel(this,null);"
)
patch(
    'mobile/android-alpha2/app/src/main/AndroidManifest.xml',
    '        <activity android:name=".RecommendationStyleActivity" android:exported="false" />\n',
    '        <activity android:name=".RecommendationStyleActivity" android:exported="false" />\n        <activity android:name=".RecommendationControlActivity" android:exported="false" />\n'
)

# Android native/offline recomputation consumes the same portable controls instead of drifting to a separate policy.
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java',
    "        for(Candidate candidate:candidates.values()){double author=authorAffinity(candidate.comic,favorites),category=categorySimilarity(candidate.comic,favorites),route=Math.min(1d,candidate.families.size()/3d),popularity=popularity(candidate.comic);double score=NativeRecommendationPolicy.frozenNeutralScore(author,category,route,popularity);",
    "        for(Candidate candidate:candidates.values()){if(RecommendationPolicyStore.blocked(app,candidate.comic))continue;double author=authorAffinity(candidate.comic,favorites),category=categorySimilarity(candidate.comic,favorites),route=Math.min(1d,candidate.families.size()/3d),popularity=popularity(candidate.comic);double score=NativeRecommendationPolicy.frozenNeutralScore(author,category,route,popularity)+RecommendationPolicyStore.adjustment(app,candidate.comic);"
)

# Build workflow: unpublished, same isolated V4 Beta data directory so frozen Visual V1 assets are reused.
build = r'''name: Recommendation V5 Portable Policy Beta Builds (unpublished)

on:
  push:
    branches: [feature/recommendation-v5-portable-policy]

permissions:
  contents: read

jobs:
  web-and-desktop:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: pnpm/action-setup@v4
        with:
          version: '11.16.0'
          run_install: false
      - run: pnpm install --frozen-lockfile
      - run: |
          pnpm type:check
          pnpm web:check
          pnpm test
          pnpm build

  windows-beta:
    needs: web-and-desktop
    runs-on: windows-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: pnpm/action-setup@v4
        with:
          version: '11.16.0'
          run_install: false
      - name: Build isolated Windows beta package
        shell: pwsh
        env:
          PICA_LIBRARY_BUILD_PROVENANCE: ${{ github.sha }}
        run: |
          pnpm install --frozen-lockfile
          pnpm type:check
          pnpm web:check
          New-Item -ItemType Directory -Force -Path artifacts/release-base | Out-Null
          $target = 'artifacts/release-base/Pica-Library-v0.3.14-windows-x64.zip'
          Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.14/Pica-Library-v0.3.14-windows-x64.zip' -OutFile $target
          $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
          if ($hash -ne '211bc7d7d4f384af0389288439e38a645a7e8a458e56d947d005cd179848cb56') { throw "Official v0.3.14 package checksum mismatch: $hash" }
          ./scripts/build-windows-package.ps1
          $source = 'artifacts/Pica-Library-v0.4.0-windows-x64.zip'
          $work = Join-Path $env:RUNNER_TEMP 'pica-v5-windows'
          $extract = Join-Path $work 'extracted'
          $betaRoot = Join-Path $work 'Pica-Library-Recommendation-V5-Beta-Windows'
          $out = 'candidate/recommendation-v5-windows'
          Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $work,$out
          New-Item -ItemType Directory -Force -Path $extract,$betaRoot,$out | Out-Null
          Expand-Archive -LiteralPath $source -DestinationPath $extract
          Get-ChildItem -LiteralPath $extract -Force | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination $betaRoot }
          $launcher = Join-Path $betaRoot 'Pica Library.exe'
          Remove-Item -Force -LiteralPath $launcher
          $csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
          & $csc /nologo /target:winexe /optimize+ /platform:x64 /reference:System.Windows.Forms.dll "/out:$launcher" 'packaging\windows\BetaLauncher.cs'
          if ($LASTEXITCODE -ne 0) { throw 'V5 beta launcher compilation failed' }
          @"
          UNPUBLISHED RECOMMENDATION V5 PORTABLE POLICY BETA
          Manual QA only. Formal v0.4.0 is untouched.
          Source SHA: $env:GITHUB_SHA
          Uses existing isolated data home: %LOCALAPPDATA%\Pica Library V4 Beta
          Frozen Visual V1 embeddings are reused; this build does not rebuild them automatically.
          "@ | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $betaRoot 'TEST_BUILD.txt')
          $zip = Join-Path $out 'Pica-Library-Recommendation-V5-Beta-Windows.zip'
          Compress-Archive -Path $betaRoot -DestinationPath $zip -CompressionLevel Optimal
          (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant() + '  Pica-Library-Recommendation-V5-Beta-Windows.zip' | Set-Content -Encoding ascii -LiteralPath (Join-Path $out 'SHA256SUMS.txt')
          $env:GITHUB_SHA | Set-Content -Encoding ascii -LiteralPath (Join-Path $out 'SOURCE_SHA.txt')
      - uses: actions/upload-artifact@v4
        with:
          name: Pica-Library-Recommendation-V5-Beta-Windows
          path: candidate/recommendation-v5-windows/
          retention-days: 3
          if-no-files-found: error

  android-beta:
    needs: web-and-desktop
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
        with:
          packages: platform-tools
      - run: yes | sdkmanager 'platforms;android-35' 'build-tools;35.0.0'
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'
      - name: Test, lint and build isolated Android beta APK
        working-directory: mobile/android-alpha2
        run: gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug --no-daemon
      - name: Package Android beta
        working-directory: mobile/android-alpha2
        run: |
          set -euo pipefail
          apk=app/build/outputs/apk/debug/app-debug.apk
          test -f "$apk"
          "$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging "$apk" > "$RUNNER_TEMP/pica-v5-package.txt"
          grep -q "package: name='com.picalibrary.android.dev'" "$RUNNER_TEMP/pica-v5-package.txt"
          grep -q "application-label:'Pica Library Dev'" "$RUNNER_TEMP/pica-v5-package.txt"
          mkdir -p candidate-v5
          cp "$apk" candidate-v5/Pica-Library-Recommendation-V5-Beta-Android.apk
          cp "$RUNNER_TEMP/pica-v5-package.txt" candidate-v5/PACKAGE_INFO.txt
          printf '%s\n' "$GITHUB_SHA" > candidate-v5/SOURCE_SHA.txt
          (cd candidate-v5 && sha256sum Pica-Library-Recommendation-V5-Beta-Android.apk > SHA256SUMS.txt)
      - uses: actions/upload-artifact@v4
        with:
          name: Pica-Library-Recommendation-V5-Beta-Android
          path: mobile/android-alpha2/candidate-v5/
          retention-days: 3
          if-no-files-found: error
'''
(ROOT / '.github/workflows/recommendation-v5-beta-build.yml').write_text(build, encoding='utf-8')

# Clean the one-shot workspace workflow after this validated transition.
workspace = ROOT / '.github/workflows/recommendation-v5-workspace.yml'
if workspace.exists():
    workspace.unlink()

print('Recommendation V5 portable-policy patch applied')
