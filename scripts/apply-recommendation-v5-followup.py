from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path: str, old: str, new: str, count: int = 1):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'FOLLOWUP_PATCH_MISS {path}: {old[:160]!r}')
    if count == 1 and text.count(old) != 1:
        raise SystemExit(f'FOLLOWUP_PATCH_AMBIGUOUS {path}: {text.count(old)} matches')
    target.write_text(text.replace(old, new, count), encoding='utf-8')

# Strong preference evidence: ownership/download/any-reading remain facts/behavior,
# but no longer become equivalent to an explicit favorite in the lifetime profile.
patch(
    'src/library/service.ts',
    "import {\n    filterCandidatesAgainstOwnedV5,\n    preferenceAdjustmentV5\n} from '../recommendation-v5/portable-policy'\n",
    "import {\n    filterCandidatesAgainstOwnedV5,\n    preferenceAdjustmentV5\n} from '../recommendation-v5/portable-policy'\nimport { applyIntentPolicyV5 } from '../recommendation-v5/intent-policy'\n"
)
patch(
    'src/library/service.ts',
    "        const favorites = catalog\n            .filter(\n                (comic) =>\n                    !dislikedIds.has(comic.comicId) &&\n                    (comic.isFavorite ||\n                        comic.inLibrary ||\n                        comic.downloadedPictures > 0 ||\n                        readingIds.has(comic.comicId) ||\n                        likedIds.has(comic.comicId))\n            )\n            .map((comic) => ({ ...comic, isFavorite: true }))",
    "        const favorites = catalog\n            .filter(\n                (comic) =>\n                    !dislikedIds.has(comic.comicId) &&\n                    (comic.isFavorite || likedIds.has(comic.comicId))\n            )\n            .map((comic) => ({ ...comic, isFavorite: true }))"
)
patch(
    'src/library/service.ts',
    "        const intents = buildRecommendationIntentsV3({\n            profile,\n            favorites,\n            history\n        })",
    "        const baseIntents = buildRecommendationIntentsV3({\n            profile,\n            favorites,\n            history\n        })\n        const intents = applyIntentPolicyV5(\n            baseIntents,\n            recommendationV5State\n        )"
)

# Keep inferred control suggestions grounded in explicit favorites, not mere
# ownership/download state. Likes are still consumed by the existing feedback layer.
patch(
    'src/recommendation-v5/portable-policy.ts',
    "    const positives = catalog.filter((comic) => comic.isFavorite || comic.inLibrary || comic.downloadedPictures > 0)",
    "    const positives = catalog.filter((comic) => comic.isFavorite)"
)

# Fact-like negative reasons suppress the item but do not automatically poison
# author/tag taste unless the user also explicitly selected a taste reason.
patch(
    'src/recommendation-v4/visual-style.ts',
    "        const reasons = new Set(feedback.reasons)\n        if (reasons.has('style') && reasons.size === 1) continue\n        const sign = feedback.sentiment === 'like' ? 1 : -1",
    "        const reasons = new Set(feedback.reasons)\n        if (reasons.has('style') && reasons.size === 1) continue\n        const hasTasteReason = ['style', 'topic', 'author', 'character'].some(\n            (reason) => reasons.has(reason)\n        )\n        if (\n            !hasTasteReason &&\n            ['already_seen', 'already_owned', 'duplicate', 'repetitive', 'temporary'].some(\n                (reason) => reasons.has(reason)\n            )\n        )\n            continue\n        const sign = feedback.sentiment === 'like' ? 1 : -1"
)

# Pairing can explicitly request one Desktop-heavy refresh after mobile policy is
# merged. Ordinary lightweight sync does not block on provider recall.
patch(
    'src/mobile/bridge-server.ts',
    "                const input = await body(request, 512 * 1024)\n                return json(\n                    response,\n                    200,\n                    options.service.mergeMobileRecommendationV5(input)\n                )",
    "                const input = await body(request, 512 * 1024)\n                const merged = options.service.mergeMobileRecommendationV5(input)\n                let recommendationRefresh: Record<string, unknown> = {\n                    requested: false\n                }\n                if (input.recompute === true) {\n                    try {\n                        const deviceId = String(input.deviceId ?? 'android')\n                        const mutationId = String(input.mutationId ?? Date.now())\n                        finalRecommendationCoordinator.forceNew(\n                            `mobile-pair:${deviceId}:${mutationId}`\n                        )\n                        await finalRecommendationCoordinator.waitForBuild()\n                        recommendationRefresh = {\n                            requested: true,\n                            completed: true,\n                            status: finalRecommendationCoordinator.status()\n                        }\n                    } catch (error) {\n                        recommendationRefresh = {\n                            requested: true,\n                            completed: false,\n                            error:\n                                error instanceof Error\n                                    ? error.message\n                                    : String(error)\n                        }\n                    }\n                }\n                return json(response, 200, {\n                    ...merged,\n                    recommendationRefresh\n                })"
)
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java',
    "    static JSONObject syncRecommendationState(Context c) throws Exception {JSONObject response=new JSONObject(post(c,\"/mobile/v1/recommendation/v5/sync\",RecommendationPolicyStore.syncPayload(c)));RecommendationPolicyStore.acknowledge(c,response);RecommendationBatch desktop=recommendationBatch(c,12);if(!desktop.items.isEmpty()){NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=\"desktop-sync-\"+System.currentTimeMillis();snapshot.generatedAt=java.time.Instant.now().toString();snapshot.readiness=\"DESKTOP_SYNCED\";snapshot.candidateCount=desktop.items.size();snapshot.batchIndex=0;List<NativeRecommendationStore.Item> items=new ArrayList<>();for(RecommendationItem item:desktop.items)items.add(new NativeRecommendationStore.Item(item.id,item.title,item.author,item.reason,\"DESKTOP\",\"\",0));snapshot.batches.add(items);NativeRecommendationStore.save(c,snapshot);}return response;}\n",
    "    static JSONObject syncRecommendationState(Context c) throws Exception {return syncRecommendationState(c,false);}\n    static JSONObject syncRecommendationState(Context c,boolean recompute) throws Exception {JSONObject payload=RecommendationPolicyStore.syncPayload(c);payload.put(\"recompute\",recompute);JSONObject response=new JSONObject(post(c,\"/mobile/v1/recommendation/v5/sync\",payload));RecommendationPolicyStore.acknowledge(c,response);RecommendationBatch desktop=recommendationBatch(c,12);if(!desktop.items.isEmpty()){NativeRecommendationStore.Snapshot snapshot=new NativeRecommendationStore.Snapshot();snapshot.cycleId=\"desktop-sync-\"+System.currentTimeMillis();snapshot.generatedAt=java.time.Instant.now().toString();snapshot.readiness=\"DESKTOP_SYNCED\";snapshot.candidateCount=desktop.items.size();snapshot.batchIndex=0;List<NativeRecommendationStore.Item> items=new ArrayList<>();for(RecommendationItem item:desktop.items)items.add(new NativeRecommendationStore.Item(item.id,item.title,item.author,item.reason,\"DESKTOP\",\"\",0));snapshot.batches.add(items);NativeRecommendationStore.save(c,snapshot);}return response;}\n"
)
patch(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java',
    "BridgeStore.save(this,h,token,name);try{BridgeClient.syncRecommendationState(this);}catch(Exception ignored){}",
    "BridgeStore.save(this,h,token,name);try{BridgeClient.syncRecommendationState(this,true);}catch(Exception ignored){}"
)

# Do not expose session modes that the current portable policy does not yet
# consume. Instead expose the implemented TARGET intent on concrete signals.
patch(
    'web/recommendation-v5-beta.js',
    "        <label>本次推荐意图\n            <select id=\"v5-session-mode\">\n                <option value=\"DEFAULT\">默认 · 长期画像</option>\n                <option value=\"FAMILIAR\">熟悉口味</option>\n                <option value=\"EXPLORE\">多探索一点</option>\n                <option value=\"RECENT\">更看重近期</option>\n            </select>\n        </label>\n        <p class=\"status\">“本次意图”只影响当前会话；标签/作者的多一点、少一点默认持续有效，随时可恢复系统判断。</p>",
    "        <div class=\"actions\"><button id=\"v5-session-reset\" type=\"button\">清除本次意图</button><span id=\"v5-session-status\" class=\"status\"></span></div>\n        <p class=\"status\">在下面某个标签、作者或分类上点“本次想看”，只影响当前会话；多一点、少一点默认持续有效，随时可恢复系统判断。</p>"
)
patch(
    'web/recommendation-v5-beta.js',
    "    panel.querySelector('#v5-session-mode').addEventListener('change', async (event) => {\n        try {\n            await post('/api/v1/recommendation-v5/session', { mode: event.target.value })\n            await loadPolicy()\n        } catch (error) {\n            showStatus(error.message, true)\n        }\n    })",
    "    panel.querySelector('#v5-session-reset').addEventListener('click', async () => {\n        try {\n            await post('/api/v1/recommendation-v5/session', { mode: 'DEFAULT' })\n            await loadPolicy()\n        } catch (error) {\n            showStatus(error.message, true)\n        }\n    })"
)
patch(
    'web/recommendation-v5-beta.js',
    "            <button type=\"button\" data-v5-direction=\"BLOCK\">屏蔽</button>\n        </div>",
    "            <button type=\"button\" data-v5-direction=\"BLOCK\">屏蔽</button>\n            <button type=\"button\" data-v5-session-target=\"true\">本次想看</button>\n        </div>"
)
patch(
    'web/recommendation-v5-beta.js',
    "    const mode = document.querySelector('#v5-session-mode')\n    if (mode) mode.value = V5.snapshot.sessionIntent?.mode || 'DEFAULT'",
    "    const sessionLabel = document.querySelector('#v5-session-status')\n    if (sessionLabel) {\n        const intent = V5.snapshot.sessionIntent || {}\n        sessionLabel.textContent = intent.mode === 'TARGET'\n            ? `本次想看：${intent.label || intent.key || ''}`\n            : '本次意图：默认'\n    }"
)
patch(
    'web/recommendation-v5-beta.js',
    "    document.querySelectorAll('[data-v5-reset]').forEach((button) => {",
    "    document.querySelectorAll('[data-v5-session-target]').forEach((button) => {\n        button.addEventListener('click', async () => {\n            const holder = button.closest('[data-v5-signal]')\n            const [targetType, ...rest] = holder.dataset.v5Signal.split(':')\n            const key = rest.join(':')\n            const signal = inferred.find((item) => item.targetType === targetType && item.key === key)\n            if (!signal) return\n            try {\n                V5.snapshot = await post('/api/v1/recommendation-v5/session', {\n                    mode: 'TARGET',\n                    targetType: signal.targetType,\n                    key: signal.key,\n                    label: signal.label\n                })\n                renderPolicy()\n            } catch (error) {\n                showStatus(error.message, true)\n            }\n        })\n    })\n    document.querySelectorAll('[data-v5-reset]').forEach((button) => {"
)

# Beta branding changes but data home deliberately stays at V4 Beta so Visual V1
# survives package upgrades exactly as verified by the user.
patch(
    'packaging/windows/BetaLauncher.cs',
    'Pica Library V4 Beta',
    'Pica Library V5 Beta',
    count=4
)
patch(
    'packaging/windows/BetaLauncher.cs',
    'info.EnvironmentVariables["PICA_LIBRARY_TEST_BUILD"] = "recommendation-v4-beta";',
    'info.EnvironmentVariables["PICA_LIBRARY_TEST_BUILD"] = "recommendation-v5-beta";'
)
# The branding replacement also changed the data-home literal; restore it so the
# frozen Visual V1 SQLite asset is reused instead of silently creating a new DB.
patch(
    'packaging/windows/BetaLauncher.cs',
    'string betaHome = Path.Combine(localAppData, "Pica Library V5 Beta");',
    'string betaHome = Path.Combine(localAppData, "Pica Library V4 Beta");'
)

print('Recommendation V5 follow-up patch applied')
