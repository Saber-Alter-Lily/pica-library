import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.7 long-task stability contract', () => {
    it('makes Desktop recommendation generation observable and controllable', () => {
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const ui = read('web/alpha8-theme-help.js')
        expect(service).toContain("recommendationBuildControl(action: 'pause' | 'resume' | 'cancel')")
        expect(service).toContain('private async recommendationCheckpoint()')
        expect(service).toContain("state: 'pausing'")
        expect(service).toContain("cancelled ? 'cancelled' : 'failed'")
        expect(server).toContain("input.action === 'pause_build'")
        expect(server).toContain("input.action === 'resume_build'")
        expect(server).toContain("input.action === 'cancel_build'")
        expect(ui).toContain("controlRecommendationBuild('pause_build')")
        expect(ui).toContain("controlRecommendationBuild('resume_build')")
        expect(ui).toContain("controlRecommendationBuild('cancel_build')")
    })

    it('bounds provider failures and preserves the last usable recommendation cycle', () => {
        const sdk = read('src/sdk.ts')
        const retriever = read('src/recommendation-v3/retriever-v3.ts')
        const coordinator = read('src/recommendation-v3/cycle-coordinator-v3.ts')
        expect(sdk).toContain('const PICA_API_TIMEOUT_MS = 15000')
        expect(retriever).toContain("stoppedBy = 'PROVIDER_FAILURE_BUDGET'")
        expect(retriever).toContain('consecutiveProviderFailures >= 3')
        expect(coordinator).toContain("built.readiness === 'FAILED_INSUFFICIENT_POOL'")
        expect(read('test/unit/recommendation-network-recovery.test.ts')).toContain('clears a stale persisted building cycle')
    })

    it('keeps Desktop visual indexing bounded and pauseable without losing pending work', () => {
        const app = read('web/app.js')
        const runtime = read('web/visual-runtime.js')
        const worker = read('web/visual-worker.js')
        const html = read('web/index.html')
        expect(html).toContain('id="visual-index-pause"')
        expect(html).toContain('id="visual-index-resume"')
        expect(app).toContain('async function visualTaskCheckpoint')
        expect(app).toContain("t('visual.cancelled')")
        expect(app).toContain('visualIndexAbortController')
        expect(app).toContain('state.visualIndexAbortController?.abort()')
        expect(runtime).toContain('MODEL_LOAD_TIMEOUT_MS = 120000')
        expect(runtime).toContain('PAGE_ANALYSIS_TIMEOUT_MS = 45000')
        expect(runtime).toContain(
            "new Worker(new URL('./visual-worker.js', import.meta.url)"
        )
        expect(runtime).toContain("signal?.addEventListener('abort'")
        expect(runtime).toContain('terminateVisualWorker(worker)')
        expect(runtime).not.toContain('Promise.race')
        expect(worker).toContain("input.type !== 'analyze'")
        expect(worker).toContain("post(id, 'page-start'")
        expect(worker).toContain('await extractor(sample.url)')
    })

    it('makes favorites sync pauseable at page checkpoints', () => {
        const provider = read('src/services/provider-service.ts')
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const app = read('web/app.js')
        expect(provider).toContain('checkpoint?: () => Promise<void>')
        expect(provider).toContain('await checkpoint?.()')
        expect(service).toContain("favoritesSyncControl(action: 'pause' | 'resume' | 'cancel')")
        expect(server).toContain("url.pathname === '/api/v1/sync/control'")
        expect(app).toContain("controlFavoritesSync('pause')")
        expect(app).toContain("controlFavoritesSync('resume')")
        expect(app).toContain("controlFavoritesSync('cancel')")
    })

    it('keeps WebDAV sync checkpointable and local hashing asynchronous', () => {
        const sync = read('src/remote-storage/sync-service.ts')
        const manager = read('src/remote-storage/desktop-manager.ts')
        const cloud = read('web/alpha7-cloud.js')
        expect(sync).toContain('await fs.promises.readFile(file)')
        expect(sync).not.toContain('const data = fs.readFileSync(file)')
        expect(sync).toContain('private checkpoint()')
        expect(sync).toContain("error.name === 'RemoteSyncCancelledError'")
        expect(manager).toContain("syncControl(action: 'pause' | 'resume' | 'cancel')")
        expect(cloud).toContain("controlRemoteSync('pause')")
        expect(cloud).toContain("controlRemoteSync('resume')")
        expect(cloud).toContain("controlRemoteSync('cancel')")
    })

    it('reattaches WebDAV progress polling after reload and stops at terminal state', () => {
        const cloud = read('web/alpha7-cloud.js')
        expect(cloud).toContain('let remoteSyncRequestPending = false')
        expect(cloud).toContain('function remoteProgressActive(progress)')
        expect(cloud).toContain(
            'if (!remoteSyncRequestPending && !remoteProgressActive(progress))'
        )
        expect(cloud).toContain('stopProgressPolling()')
        expect(cloud).toContain(
            'if (remoteProgressActive(remoteState.syncProgress))'
        )
        expect(cloud).toContain('startProgressPolling()')
        expect(cloud).toContain('remoteSyncRequestPending = true')
        expect(cloud).toContain('remoteSyncRequestPending = false')
        expect(cloud).toContain(
            "window.addEventListener('pagehide', stopProgressPolling)"
        )
    })

    it('keeps the persistent Downloads screen file and URI scans off the UI render path', () => {
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/DownloadsActivity.java')
        const store = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PhoneDownloadStore.java')

        expect(activity).toContain('Executors.newSingleThreadExecutor()')
        expect(activity).toContain('private DownloadState readDownloads()')
        expect(activity).toContain('PhoneDownloadStore.Snapshot snapshot=PhoneDownloadStore.load(this)')
        expect(activity).toContain('PhoneDownloadStore.estimatedBytes(this,snapshot)')
        expect(activity).toContain('worker.submit(()->{')
        expect(activity).toContain('private void renderList(DownloadState state)')
        expect(activity).toContain('private void deleteDownload(String comicId)')
        expect(activity).toContain('PhoneDownloadStore.remove(this,comicId)')
        expect(activity).toContain('private boolean destroyed')
        expect(activity).toContain('private int loadGeneration')
        expect(activity).toContain('if(destroyed||generation!=loadGeneration)return')
        expect(activity).toContain(
            '@Override protected void onDestroy(){destroyed=true;loadGeneration++;worker.shutdownNow();super.onDestroy();}'
        )

        const renderStart = activity.indexOf('private void renderList(DownloadState state)')
        const renderEnd = activity.indexOf('private void open(', renderStart)
        const renderBody = activity.slice(renderStart, renderEnd)
        expect(renderBody).not.toContain('PhoneDownloadStore.load(')
        expect(renderBody).not.toContain('PhoneDownloadStore.estimatedBytes(')

        const confirmStart = activity.indexOf('private void confirmDelete(')
        const confirmEnd = activity.indexOf('private void deleteDownload(', confirmStart)
        const confirmBody = activity.slice(confirmStart, confirmEnd)
        expect(confirmBody).not.toContain('PhoneDownloadStore.remove(')

        expect(store).toContain('static long estimatedBytes(Context context,Snapshot snapshot)')
        expect(store).toContain('return estimatedBytes(context,load(context))')
    })

    it('gives Android recommendation, downloads and imports durable pause/resume semantics', () => {
        const taskCenter = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/TaskCenterActivity.java')
        const recJobs = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationJobs.java')
        const recEngine = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java')
        const downloadJobs = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaDownloadJobs.java')
        const downloadWorker = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaDownloadWorker.java')
        const favoriteJobs = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/FavoriteImportJobs.java')
        const bootstrap = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBootstrapWorker.java')
        expect(recJobs).toContain('static void pause(Context context)')
        expect(recJobs).toContain('static void resume(Context context)')
        expect(recJobs).not.toContain('setPaused(context,"recommendation",UNIQUE_NAME,true);WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME)')
        expect(recJobs).toContain('ExistingWorkPolicy.KEEP')
        expect(recEngine).toContain('interface Control { void checkpoint() throws Exception; }')
        expect(recEngine).toContain('consecutivePicaFailures>=3')
        expect(downloadJobs).toContain('static void pause(Context context,String comicId,String episodeId)')
        expect(downloadJobs).toContain('static void resume(Context context,String comicId,String episodeId)')
        expect(downloadWorker).toContain('PhoneDownloadStore.putChapter')
        expect(favoriteJobs).toContain('static void pause(Context context)')
        expect(favoriteJobs).toContain('static void resume(Context context)')
        expect(bootstrap).toContain('正在读取 Pica 收藏 · 第 ')
        expect(taskCenter).toContain('继续会从已经完成并校验的页面续传。')
        expect(taskCenter).toContain('继续会从当前检查点继续本轮生成；上一轮可用推荐不会被覆盖。')
    })

    it('reconstructs current Android WorkManager tasks by durable identity', () => {
        const taskCenter = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/TaskCenterActivity.java'
        )
        const registry = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MobileTaskRegistryStore.java'
        )
        const picaJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaDownloadJobs.java'
        )
        const ehJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhDownloadJobs.java'
        )
        const favoriteJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/FavoriteImportJobs.java'
        )
        const bootstrapJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBootstrapJobs.java'
        )
        const recommendationJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationJobs.java'
        )
        const picaWorker = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaDownloadWorker.java'
        )
        const ehWorker = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhDownloadWorker.java'
        )

        expect(registry).toContain('background-task-registry-v1')
        expect(registry).toContain('static synchronized void setWorkId(')
        expect(registry).toContain('static synchronized void registerDownload(')
        expect(registry).toContain('static synchronized List<DownloadRef> downloads(')

        expect(taskCenter).toContain('private WorkInfo currentWork(')
        expect(taskCenter).toContain(
            'MobileTaskRegistryStore.workId(this,scope,id)'
        )
        expect(taskCenter).toContain(
            'value.getId().toString().equals(expected)'
        )
        expect(taskCenter).toContain(
            'private List<DownloadView> reconstructDownloads('
        )
        expect(taskCenter).toContain(
            'MobileTaskRegistryStore.downloads(this)'
        )
        expect(taskCenter).toContain(
            'MobileTaskRegistryStore.registerDownload(this'
        )
        expect(taskCenter).not.toContain(
            'values.get(values.size()-1)'
        )
        expect(taskCenter).not.toContain(
            'private static WorkInfo latest('
        )

        expect(picaJobs).toContain(
            'MobileTaskRegistryStore.registerDownload(context,"pica"'
        )
        expect(picaJobs).toContain(
            'MobileTaskRegistryStore.unregisterDownload(context,"pica"'
        )
        expect(ehJobs).toContain(
            'MobileTaskRegistryStore.registerDownload(context,"eh"'
        )
        expect(ehJobs).toContain(
            'MobileTaskRegistryStore.unregisterDownload(context,"eh"'
        )
        expect(picaWorker).toContain(
            'PicaDownloadJobs.complete(getApplicationContext(),comicId,selected)'
        )
        expect(ehWorker).toContain(
            'EhDownloadJobs.complete(getApplicationContext(),comicId)'
        )

        expect(favoriteJobs).toContain(
            'MobileTaskRegistryStore.setWorkId('
        )
        expect(bootstrapJobs).toContain(
            'MobileTaskRegistryStore.setWorkId(context,"pica-bootstrap"'
        )
        expect(recommendationJobs).toContain(
            'MobileTaskRegistryStore.setWorkId(context,"recommendation"'
        )
    })

    it('uses the official WorkManager recovery test harness for G14', () => {
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        const recovery = read(
            'mobile/android-alpha2/app/src/test/java/com/picalibrary/android/WorkManagerRecoveryTest.java'
        )

        expect(gradle).toContain(
            "testImplementation 'androidx.work:work-testing:2.9.1'"
        )
        expect(recovery).toContain('WorkManagerTestInitHelper.initializeTestWorkManager')
        expect(recovery).toContain(
            'replaceHistoryReconstructsOnlyPersistedCurrentDownload'
        )
        expect(recovery).toContain('activeWorkRepairsStaleRegistryUuid')
        expect(recovery).toContain(
            'pausedDownloadSurvivesWhenHistoricalWorkInfoIsUnavailable'
        )
        expect(recovery).toContain(
            'nonPausedMissingDownloadDoesNotResurrect'
        )
        expect(recovery).toContain(
            'singletonRecoveryUsesExactPersistedRequestAndRepairsStaleUuid'
        )
        expect(recovery).toContain('.setInitialDelay(1,TimeUnit.DAYS)')
        expect(recovery).toContain('@LooperMode(LooperMode.Mode.PAUSED)')
    })

    it('forces a live Android WorkManager process through adb restart for G15', () => {
        const favoriteJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/FavoriteImportJobs.java'
        )
        const favoriteWorker = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/FavoriteImportWorker.java'
        )
        const bootstrapJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBootstrapJobs.java'
        )
        const bootstrapWorker = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBootstrapWorker.java'
        )
        const recommendationJobs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationJobs.java'
        )
        const recommendationWorker = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationWorker.java'
        )
        const recovery = read(
            'mobile/android-alpha2/app/src/androidTest/java/com/picalibrary/android/WorkerForceStopRecoveryTest.java'
        )
        const probe = read(
            'mobile/android-alpha2/app/src/debug/java/com/picalibrary/android/WorkerRecoveryProbeWorker.java'
        )
        const runner = read('scripts/run-android-worker-force-stop-recovery.sh')
        const workflow = read('.github/workflows/android-worker-force-stop-recovery.yml')

        expect(favoriteJobs).toContain(
            'MobileTaskRegistryStore.clearWorkId(context,"favorite-import",UNIQUE_NAME)'
        )
        expect(bootstrapJobs).toContain(
            'MobileTaskRegistryStore.clearWorkId(context,"pica-bootstrap",UNIQUE_NAME)'
        )
        expect(recommendationJobs).toContain(
            'MobileTaskRegistryStore.clearWorkId(context,"recommendation",UNIQUE_NAME)'
        )
        expect(favoriteWorker).toContain('FavoriteImportJobs.complete(getApplicationContext())')
        expect(bootstrapWorker).toContain('PicaBootstrapJobs.complete(app)')
        expect(recommendationWorker).toContain(
            'NativeRecommendationJobs.complete(getApplicationContext())'
        )

        expect(recovery).toContain('seedDurableRecoveryStateAndAwaitForceStop()')
        expect(recovery).toContain('verifyDurableRecoveryStateAfterForceStop()')
        expect(recovery).toContain(
            'assertNotEquals("verification must run in a fresh process"'
        )
        expect(recovery).toContain('awaitProbeRuns(app, 2)')
        expect(recovery).toContain('ActivityScenario<TaskCenterActivity>')
        expect(recovery).toContain(
            'explicitly cancelled download history must not resurrect'
        )
        expect(probe).toContain('while (!isStopped()) Thread.sleep(200L)')
        expect(runner).toContain('files/p2-g15-ready')
        expect(runner).toContain('adb shell am force-stop "$TARGET_PACKAGE"')
        expect(workflow).toContain('ReactiveCircus/android-emulator-runner@v2')
    })

    it('retains mature Desktop download and Android updater controls', () => {
        const web = read('web/app.js')
        const server = read('src/library/server.ts')
        const updater = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UpdateActivity.java')
        expect(web).toContain('data-job-action="pause"')
        expect(web).toContain('data-job-action="resume"')
        expect(server).toContain('(pause|resume|retry|cancel)')
        expect(updater).toContain('DownloadManager')
        expect(updater).toContain('STALL_MS=120_000L')
    })
})
