import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('post-v0.4.8 mobile resume, preference scroll and update notices', () => {
    it('keeps Android recommendation work alive while user-paused', () => {
        const jobs = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationJobs.java')
        const worker = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationWorker.java')
        const panel = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationProgressPanel.java')
        expect(jobs).toContain('static void pause(Context context){MobileTaskPauseStore.setPaused(context,"recommendation",UNIQUE_NAME,true);}')
        expect(jobs).not.toContain('setPaused(context,"recommendation",UNIQUE_NAME,true);WorkManager.getInstance')
        expect(jobs).toContain('ExistingWorkPolicy.KEEP')
        expect(worker).toContain('while(NativeRecommendationJobs.paused(app))')
        expect(worker).toContain('Thread.sleep(250L)')
        expect(worker).toContain('this::checkpoint')
        expect(panel).toContain('继续会从当前检查点继续本轮生成')
    })

    it('restores the Android manual-preference viewport after a mutation reload', () => {
        const controls = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java')
        expect(controls).toContain('private ScrollView outerScroll;')
        expect(controls).toContain('final int restoreY=outerScroll==null?0:Math.max(0,outerScroll.getScrollY())')
        expect(controls).toContain('restoreOuterScroll(restoreY)')
        expect(controls).toContain('outerScroll.post(()->outerScroll.scrollTo(0,Math.max(0,y)))')
        expect(controls).toContain('if(!loadedOnce)showLoading()')
    })

    it('surfaces update availability automatically on Android without requiring notification permission', () => {
        const prompt = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AutoUpdatePrompt.java')
        const home = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
        const background = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UpdateCheckWorker.java')
        expect(prompt).toContain('UpdateClient.check')
        expect(prompt).toContain('UpdateClient.newer')
        expect(prompt).toContain('new AlertDialog.Builder(activity)')
        expect(prompt).toContain('PROMPT_INTERVAL_MS=12L*60*60*1000')
        expect(home).toContain('AutoUpdatePrompt.maybePrompt(this)')
        expect(background).toContain('notifyUpdate(app,info)')
    })

    it('checks and prompts for updates automatically on Desktop without auto-installing', () => {
        const app = read('web/app.js')
        const i18n = read('web/i18n.js')
        const ja = read('web/i18n-ja-reader-update.js')
        expect(app).toContain('async function maybePromptForUpdate()')
        expect(app).toContain("api('/api/v1/update/check')")
        expect(app).toContain("askConfirm(t('update.availablePrompt'")
        expect(app).toContain(".a87-hub-nav button[data-hub-panel=\"software\"]")
        expect(app).toContain("$('#settings-update')?.scrollIntoView")
        expect(app).toContain('setTimeout(() => void maybePromptForUpdate(), 1400)')
        expect(app).not.toContain('maybePromptForUpdate().then(applyStagedUpdate')
        expect(i18n).toContain("'update.availablePrompt'")
        expect(ja).toContain("'update.availablePrompt'")
    })
})
