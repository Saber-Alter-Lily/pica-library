import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Android smoothness P3A', () => {
    it('keeps cover disk decode off the ImageView binding path and deduplicates loads', () => {
        const cover = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/CoverRepository.java'
        )
        expect(cover).toContain(
            'ConcurrentHashMap<String,CompletableFuture<Bitmap>> IN_FLIGHT'
        )
        expect(cover).toContain('IN_FLIGHT.computeIfAbsent')
        expect(cover).toContain('loadFuture(activity,entry).thenAccept')
        const start = cover.indexOf('static void load(Activity activity')
        const end = cover.indexOf('static void prefetch(', start)
        const load = cover.slice(start, end)
        expect(load).toContain('Bitmap hit=memory(cacheKey)')
        expect(load).not.toContain('diskHit(activity')
        expect(load).not.toContain('BitmapFactory.decodeFile')
    })

    it('prevents overlapping Task Center polls and includes E-H downloads', () => {
        const task = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/TaskCenterActivity.java'
        )
        expect(task).toContain('AtomicBoolean refreshInFlight')
        expect(task).toContain('refreshInFlight.compareAndSet(false,true)')
        expect(task).toContain('refreshInFlight.set(false)')
        expect(task).toContain('getWorkInfosByTag("pica-download")')
        expect(task).toContain('getWorkInfosByTag("eh-download")')
        expect(task).toContain('tags.contains("eh-download")')
        expect(task).toContain('EhDownloadJobs.pause(this,comic)')
        expect(task).toContain('EhDownloadJobs.resume(this,comic)')
        expect(task).toContain('EhDownloadJobs.cancel(this,comic)')
    })

    it('gives E-H downloads persistent pause/resume state just like Pica downloads', () => {
        const eh = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhDownloadJobs.java'
        )
        expect(eh).toContain('static void pause(Context context,String comicId)')
        expect(eh).toContain('static void resume(Context context,String comicId)')
        expect(eh).toContain('static boolean paused(Context context,String comicId)')
        expect(eh).toContain('ExistingWorkPolicy.REPLACE')
        expect(eh).toContain(
            'MobileTaskPauseStore.setPaused(context,"download",name(comicId),true)'
        )
    })
})
