import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const root='mobile/android-alpha2/app/src/main/java/com/picalibrary/android/'
const read=(file:string)=>fs.readFileSync(root+file,'utf8')

describe('Recommendation V4 Android feedback parity',()=>{
  it('stores sentiment immediately and keeps reasons optional',()=>{
    const store=read('RecommendationFeedbackStore.java')
    const home=read('HomeActivity.java')
    const settings=read('SettingsActivity.java')
    expect(store).toContain('setSentiment(Context context,String comicId,String sentiment)')
    expect(store).toContain('remove(REASONS+id)')
    expect(store).toContain('askReasons(Context context)')
    const start=home.indexOf('private void recommendationFeedback(')
    const method=home.slice(start,home.indexOf('private void onlineEntry()',start))
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeGreaterThanOrEqual(0)
    expect(method.indexOf('RecommendationFeedbackStore.setSentiment')).toBeLessThan(method.indexOf('RecommendationFeedbackStore.askReasons'))
    expect(method).toContain('setNegativeButton("跳过"')
    expect(settings).toContain('"推荐反馈原因"')
    expect(settings).toContain('RecommendationFeedbackStore.setAskReasons')
  })

  it('uses likes as native seeds and suppresses every explicitly feedbacked item',()=>{
    const engine=read('NativeRecommendationEngine.java')
    const home=read('HomeActivity.java')
    expect(engine).toContain('RecommendationFeedbackStore.isLiked(app,known.id)')
    expect(engine).toContain('!RecommendationFeedbackStore.isDisliked(app,known.id)')
    expect(engine).toContain('allFavoriteIds.addAll(RecommendationFeedbackStore.feedbackIds(app))')
    expect(home).toContain('if(RecommendationFeedbackStore.hasFeedback(this,item.comicId))continue;')
  })
})
