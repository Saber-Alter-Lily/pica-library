import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const root='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'
const read=(file:string)=>fs.readFileSync(root+file,'utf8')

describe('Recommendation V4 Android feedback parity',()=>{
  it('stores sentiment immediately and keeps reasons optional',()=>{
    const store=read('RecommendationFeedbackStore.java')
    const home=read('HomeActivity.java')
    const settings=read('SettingsActivity.java')
    const visualSettings=read('RecommendationStyleActivity.java')
    expect(store).toContain('setSentiment(Context context,String comicId,String sentiment)')
    expect(store).toContain('remove(REASONS+id)')
    expect(store).toContain('askReasons(Context context)')
    const start=home.indexOf('private void recommendationFeedback(')
    const method=home.slice(start,home.indexOf('private void onlineEntry()',start))
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeGreaterThanOrEqual(0)
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeLessThan(method.indexOf('RecommendationFeedbackStore.askReasons'))
    expect(method).toContain('setNegativeButton(LocalizedText.ui("跳过")')
    expect(settings).toContain('"推荐与画风"')
    expect(settings).toContain('RecommendationStyleActivity.class')
    expect(visualSettings).toContain('"反馈原因"')
    expect(visualSettings).toContain('RecommendationFeedbackStore.setAskReasons')
  })

  it('keeps the presented batch stable while feedback affects later recommendation cycles',()=>{
    const engine=read('NativeRecommendationEngine.java')
    const home=read('HomeActivity.java')
    const portablePolicy=read('RecommendationPolicyStore.java')
    expect(engine).toContain('RecommendationFeedbackStore.isLiked(app,known.id)')
    expect(engine).toContain('!RecommendationFeedbackStore.isDisliked(app,known.id)')
    expect(engine).toContain('allFavoriteIds.addAll(RecommendationFeedbackStore.feedbackIds(app))')
    expect(home).toContain('RecommendationPolicyStore.applyLocalPolicy')
    expect(portablePolicy).not.toContain('RecommendationFeedbackStore.hasFeedback(c,item.comicId)||blocked(current,item)')
    expect(home).toContain('recommendationVisibleSnapshot')
    expect(home).toContain('refreshCurrentRecommendationFeedback()')
    expect(home).toContain('liked?"👍 已喜欢":"👍 喜欢"')
    expect(home).toContain('disliked?"👎 已不喜欢":"👎 不喜欢"')
    const start=home.indexOf('private void recommendationFeedback(')
    const method=home.slice(start,home.indexOf('private void openOnlineSource(',start))
    expect(method).not.toContain('show();')
    expect(method).not.toContain('switchHomeRecommendationBatch')
    expect(method).not.toContain('moveVisibleBatch')
  })
})
