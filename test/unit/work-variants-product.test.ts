import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('owned-work exclusion and work-variant detail UX', () => {
    it('keeps Final V3 serving behind an ownership-aware work gate', () => {
        const coordinator = read(
            'src/recommendation-v3/cycle-coordinator-v3.ts'
        )
        const database = read('src/library/database.ts')
        expect(coordinator).toContain('recommendationOwnershipState()')
        expect(database).toContain('recommendationOwnershipState()')
        expect(database).toContain("p.status = 'completed'")
        expect(coordinator).toContain('listAllWorkIdentityBindings()')
        expect(coordinator).toContain('canonicalOwnedComicIds')
        expect(coordinator).toContain('canonicalOwnedWorkCount')
        expect(coordinator).toContain('filterCandidatesAgainstOwnedV5')
        expect(coordinator).toContain('ownershipKey')
        expect(coordinator).toContain(
            'existing.ownershipKey === ownershipKey'
        )
    })

    it('exposes a read-only work-variant endpoint without auto-binding', () => {
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const bridge = read('src/mobile/bridge-server.ts')
        expect(service).toContain('workVariantsForComic(comicId: string')
        expect(service).toContain("'PROBABLE_SAME_WORK'")
        expect(service).toContain('workIdentityCreatorBucketKeysV3(')
        expect(service).toContain('workIdentityDetailEvidenceV3(')
        expect(service).toContain('workIdentitySignalsV2(')
        expect(service).toContain("embedding.embeddingKind === 'cover'")
        expect(service).toContain("coverIdentityStage: 'REVIEW_CONFIRMATION'")
        expect(service).toContain('favoriteCount')
        expect(service).toContain('downloadedCount')
        expect(service).toContain('count: rankedItems.length')
        expect(service).not.toMatch(
            /workVariantsForComic[\s\S]{0,800}saveWorkIdentityEvidence/
        )
        expect(server).toContain('workVariantsRequest')
        expect(server).toContain('work-variants$')
        expect(bridge).toContain('workVariantsRoute')
        expect(bridge).toContain('work-variants$')
    })

    it('shows same-work ownership status before expansion and makes every variant navigable', () => {
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(app).toContain('id="work-variants-panel"')
        expect(app).toContain("t('workVariants.summary'")
        const i18n = read('web/i18n.js')
        expect(i18n).toContain("'workVariants.summary': '同一作品 · {count}'")
        expect(i18n).toContain("'workVariants.summary': 'Same work · {count}'")
        expect(i18n).toContain("'workVariants.favoriteCount': '已有收藏 · {count}'")
        expect(i18n).toContain("'workVariants.noFavorite': '无已收藏版本'")
        expect(app).toContain('function renderWorkVariantSummary(panel, value)')
        expect(app).toContain('value?.favoriteCount')
        expect(app).toContain('workVariants.notFavorite')
        expect(app).toContain('class="work-variant-open-link"')
        expect(app).toContain("event.target.closest?.('[data-work-variant-open]')")
        expect(app).toContain("openRecommendationDetail(id, 'work-variant', item)")
        expect(app).toContain('if (panel.open) renderWorkVariantList(panel)')
        expect(css).toContain('.work-variant-summary-chip')
        expect(css).toContain('.work-variant-card:hover')
        expect(css).toContain('.work-variant-open-link:focus-visible')
    })

    it('keeps Android work variants collapsed and independently resolves probable works offline', () => {
        const detail = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java'
        )
        const resolver = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/WorkVariantResolver.java'
        )
        expect(detail).toContain('"同一作品 · "+count')
        expect(detail).toContain('" · 已收藏 "+favoriteCount')
        expect(detail).toContain('" · 无收藏"')
        expect(detail).toContain('workVariantArea.setVisibility(View.GONE)')
        expect(detail).toContain('toggleWorkVariants()')
        expect(detail).toContain('renderWorkVariants()')
        expect(detail).toContain('"查看版本 →"')
        expect(detail).toContain('card.setOnClickListener(openAction)')
        expect(detail).toContain('open.setOnClickListener(openAction)')
        expect(resolver).toContain('root.put("favoriteCount",favoriteCount)')
        expect(resolver).toContain('root.put("downloadedCount",downloadedCount)')
        expect(resolver).toContain('BridgeClient.workVariants')
        expect(resolver).toContain('portable.identityByComic')
        expect(resolver).toContain('"CONFIRMED_WORK_VARIANT"')
        expect(resolver).toContain('"PROBABLE_SAME_WORK"')
        expect(resolver).toContain('AuthorConceptStore.build(context)')
        expect(resolver).toContain('CoverIdentityHash.similarity')
        expect(resolver).toContain('MAX_COVER_REVIEWS=4')
    })

    it('routes library, downloaded and shelf entries through the common detail surface', () => {
        const app = read('web/app.js')
        const visual = read('web/visual-qc.js')
        expect(app).toContain('data-library-detail=')
        expect(app).toContain("'pica-open-comic-detail'")
        expect(visual).toContain("new CustomEvent('pica-open-comic-detail'")
    })
})
