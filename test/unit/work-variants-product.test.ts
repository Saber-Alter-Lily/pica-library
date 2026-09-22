import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('owned-work exclusion and work-variant detail UX', () => {
    it('keeps Final V3 serving behind an ownership-aware work gate', () => {
        const coordinator = read('src/recommendation-v3/cycle-coordinator-v3.ts')
        const database = read('src/library/database.ts')
        expect(coordinator).toContain('recommendationOwnershipState()')
        expect(database).toContain('recommendationOwnershipState()')
        expect(database).toContain("p.status = 'completed'")
        expect(coordinator).toContain('listWorkIdentityBindings(10000)')
        expect(coordinator).toContain('canonicalOwnedComicIds')
        expect(coordinator).toContain('canonicalOwnedWorkCount')
        expect(coordinator).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('ownershipKey')
        expect(coordinator).toContain('existing.ownershipKey === ownershipKey')
    })

    it('exposes a read-only work-variant endpoint without auto-binding', () => {
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const bridge = read('src/mobile/bridge-server.ts')
        expect(service).toContain('workVariantsForComic(comicId: string')
        expect(service).toContain("'PROBABLE_SAME_WORK'")
        expect(service).toContain('workIdentityEvidenceV5(')
        expect(service).not.toContain('workVariantsForComic(comicId: string, limit = 24) {\n        this.database.saveWorkIdentity')
        expect(server).toContain('workVariantsRequest')
        expect(server).toContain('work-variants
    })

    it('keeps Desktop details collapsed to only the related-work count until opened', () => {
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(app).toContain('id="work-variants-panel"')
        expect(app).toContain("t('workVariants.summary'")
        expect(app).toContain('if (panel.open) renderWorkVariantList(panel)')
        expect(app).toContain('data-work-variant-open')
        expect(css).toContain('.work-variants-panel:not([open])')
        expect(css).toContain('.work-variant-card')
    })

    it('keeps Android work variants collapsed to a count and supports offline confirmed bindings', () => {
        const detail = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java')
        const resolver = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/WorkVariantResolver.java')
        expect(detail).toContain('"相似作品 · "+count')
        expect(detail).toContain('workVariantArea.setVisibility(View.GONE)')
        expect(detail).toContain('toggleWorkVariants()')
        expect(detail).toContain('renderWorkVariants()')
        expect(resolver).toContain('BridgeClient.workVariants')
        expect(resolver).toContain('portable.identityByComic')
        expect(resolver).toContain('"CONFIRMED_WORK_VARIANT"')
        expect(resolver).not.toContain('PROBABLE_SAME_WORK')
    })
})
)
        expect(bridge).toContain('workVariantsRoute')
        expect(bridge).toContain('work-variants
    })

    it('keeps Desktop details collapsed to only the related-work count until opened', () => {
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(app).toContain('id="work-variants-panel"')
        expect(app).toContain("t('workVariants.summary'")
        expect(app).toContain('if (panel.open) renderWorkVariantList(panel)')
        expect(app).toContain('data-work-variant-open')
        expect(css).toContain('.work-variants-panel:not([open])')
        expect(css).toContain('.work-variant-card')
    })

    it('keeps Android work variants collapsed to a count and supports offline confirmed bindings', () => {
        const detail = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java')
        const resolver = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/WorkVariantResolver.java')
        expect(detail).toContain('"相似作品 · "+count')
        expect(detail).toContain('workVariantArea.setVisibility(View.GONE)')
        expect(detail).toContain('toggleWorkVariants()')
        expect(detail).toContain('renderWorkVariants()')
        expect(resolver).toContain('BridgeClient.workVariants')
        expect(resolver).toContain('portable.identityByComic')
        expect(resolver).toContain('"CONFIRMED_WORK_VARIANT"')
        expect(resolver).not.toContain('PROBABLE_SAME_WORK')
    })
})
)
    })

    it('keeps Desktop details collapsed to only the related-work count until opened', () => {
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(app).toContain('id="work-variants-panel"')
        expect(app).toContain("t('workVariants.summary'")
        expect(app).toContain('if (panel.open) renderWorkVariantList(panel)')
        expect(app).toContain('data-work-variant-open')
        expect(css).toContain('.work-variants-panel:not([open])')
        expect(css).toContain('.work-variant-card')
    })

    it('keeps Android work variants collapsed to a count and supports offline confirmed bindings', () => {
        const detail = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java')
        const resolver = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/WorkVariantResolver.java')
        expect(detail).toContain('"相似作品 · "+count')
        expect(detail).toContain('workVariantArea.setVisibility(View.GONE)')
        expect(detail).toContain('toggleWorkVariants()')
        expect(detail).toContain('renderWorkVariants()')
        expect(resolver).toContain('BridgeClient.workVariants')
        expect(resolver).toContain('portable.identityByComic')
        expect(resolver).toContain('"CONFIRMED_WORK_VARIANT"')
        expect(resolver).not.toContain('PROBABLE_SAME_WORK')
    })
})
