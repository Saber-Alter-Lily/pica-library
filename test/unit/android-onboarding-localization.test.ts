import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const root='mobile/android-alpha2/'
const read=(p:string)=>fs.readFileSync(root+p,'utf8')

describe('Android onboarding contracts',()=>{
  it('keeps versioned onboarding state with session-only Later and persistent Skip/Complete',()=>{
    const store=read('app/src/main/java/com/picalibrary/android/OnboardingStore.java')
    expect(store).toContain('CURRENT_VERSION=3')
    expect(store).toContain('private static int inherited')
    expect(store).toContain('static boolean sessionDismissed=false')
    expect(store).toContain('static void later(){sessionDismissed=true;}')
    expect(store).toContain('putInt(DISMISSED,CURRENT_VERSION)')
    expect(store).toContain('putInt(COMPLETED,CURRENT_VERSION)')
    expect(store).toContain('static void replay(){sessionDismissed=false;}')
  })

  it('uses vendored VSpot source without raising the Android SDK dependency',()=>{
    const gradle=read('app/build.gradle')
    expect(gradle).not.toContain('io.github.tutorialsandroid:vspot')
    expect(fs.existsSync(root+'app/src/main/java/com/developer/spoti/vspoti/VSpotView.java')).toBe(true)
    expect(fs.existsSync(root+'app/src/main/java/com/developer/spoti/vspoti/VSpotMessageView.java')).toBe(true)
    expect(fs.existsSync(root+'third_party/VSpot-LICENSE.txt')).toBe(true)
    expect(read('third_party/VSpot-LICENSE.txt')).toContain('MIT License')
  })

  it('provides multi-stage task spotlight navigation and explicit localized Skip',()=>{
    const tour=read('app/src/main/java/com/picalibrary/android/AndroidOnboarding.java')
    expect(tour).toContain('showBottomTour(activity)')
    expect(tour).toContain('showLibraryWorkflowTour(activity)')
    expect(tour).toContain('showRecommendationWorkflowTour(activity)')
    expect(tour).toContain('showSettingsTour(activity)')
    expect(tour).toContain('startRecommendationStyleTour')
    expect(tour).toContain('style.skipButtonText=activity.getString(R.string.onboarding_skip)')
    expect(tour).toContain('if(completed)activity.onboardingShowTab(0,()->showLibraryWorkflowTour(activity))')
    expect(tour).toContain('if(completed)activity.onboardingShowTab(1,()->showRecommendationWorkflowTour(activity))')
    expect(tour).not.toContain('if(completed)activity.onboardingShowTab(3,()->showSettingsTour(activity))')
    expect(tour).toContain('OnboardingStore.completeAdvanced(activity)')
    expect(tour).toContain('if(attempts>=20)')
    expect(tour).toContain('activity.isFinishing()||activity.isDestroyed()')
    expect(tour).toContain('else handleSkip(activity)')
    expect(tour).toContain('OnboardingStore.complete(activity)')
    expect(tour).toContain('OnboardingStore.skip(activity)')
    expect(tour).toContain('R.string.onboarding_skip_notice')
  })

  it('keeps replay available in Settings even when automatic prompting is disabled',()=>{
    const activity=read('app/src/main/java/com/picalibrary/android/OnboardingSettingsActivity.java')
    const home=read('app/src/main/java/com/picalibrary/android/HomeActivity.java')
    expect(activity).toContain('OnboardingStore.replay()')
    expect(activity).toContain('OnboardingStore.setAutoShow(this,checked)')
    expect(activity).toContain('putExtra("startOnboarding",true)')
    expect(activity).toContain('AdvancedGuideActivity.class')
    expect(home).toContain('OnboardingSettingsActivity.class')
    expect(home).toContain('AndroidOnboarding.SETTINGS_HELP')
  })

  it('keeps advanced spotlight skip and missing targets independent from daily state',()=>{
    const tour=read('app/src/main/java/com/picalibrary/android/AndroidOnboarding.java')
    const store=read('app/src/main/java/com/picalibrary/android/OnboardingStore.java')
    expect(tour).toContain('else handleSkip(activity,true)')
    expect(tour).toContain('if(advanced)OnboardingStore.skipAdvanced(activity)')
    expect(tour).toContain('if(!advanced)OnboardingStore.later()')
    expect(tour).toContain('R.string.advanced_guide_spotlight_done')
    expect(store).toContain('putInt("advancedSpotlightDismissedVersion",CURRENT_VERSION)')
  })

  it('ships complete zh-CN / ja / en onboarding resources',()=>{
    for(const file of ['app/src/main/res/values/strings.xml','app/src/main/res/values-zh-rCN/strings.xml','app/src/main/res/values-ja/strings.xml']){
      const value=read(file)
      for(const key of ['onboarding_settings_title','onboarding_welcome_title','onboarding_start','onboarding_skip','tour_library_title','tour_shelf_workflow_title','tour_generate_recommend_title','tour_manual_adjust_title','tour_visual_mode_title','tour_visual_strength_title','tour_complete_title']){
        expect(value).toContain(`name="${key}"`)
      }
    }
  })

  it('ships eight offline, explicit advanced chapters without provider calls',()=>{
    const guide=read('app/src/main/java/com/picalibrary/android/AdvancedGuideActivity.java')
    expect(guide).toContain('OnboardingStore.markAdvancedRead')
    expect(guide).toContain('guideChapter')
    expect(guide).not.toMatch(/BridgeClient\.|PicaClient\.|\.login\(|\.sync\(|\.download\(/)
    expect(read('app/src/main/AndroidManifest.xml')).toContain('android:name=".AdvancedGuideActivity" android:exported="false"')
    for(const folder of ['values','values-zh-rCN','values-ja']){
      const xml=read('app/src/main/res/'+folder+'/guide_strings.xml')
      for(const array of ['advanced_guide_titles','advanced_guide_bodies','advanced_guide_actions']){
        const body=xml.match(new RegExp('<string-array name="'+array+'">([\\s\\S]*?)</string-array>'))?.[1]||''
        expect((body.match(/<item>/g)||[]).length).toBe(8)
      }
    }
  })
})
