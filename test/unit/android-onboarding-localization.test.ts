import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const root='mobile/android-alpha2/'
const read=(p:string)=>fs.readFileSync(root+p,'utf8')

describe('Android onboarding contracts',()=>{
  it('keeps versioned onboarding state with session-only Later and persistent Skip/Complete',()=>{
    const store=read('app/src/main/java/com/picalibrary/android/OnboardingStore.java')
    expect(store).toContain('CURRENT_VERSION=1')
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

  it('provides two-stage spotlight navigation and explicit localized Skip',()=>{
    const tour=read('app/src/main/java/com/picalibrary/android/AndroidOnboarding.java')
    expect(tour).toContain('showBottomTour(activity)')
    expect(tour).toContain('showSettingsTour(activity)')
    expect(tour).toContain('style.skipButtonText=activity.getString(R.string.onboarding_skip)')
    expect(tour).toContain('if(completed)activity.onboardingShowTab(3,()->showSettingsTour(activity))')
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
    expect(home).toContain('OnboardingSettingsActivity.class')
    expect(home).toContain('AndroidOnboarding.SETTINGS_HELP')
  })

  it('ships complete zh-CN / ja / en onboarding resources',()=>{
    for(const file of ['app/src/main/res/values/strings.xml','app/src/main/res/values-zh-rCN/strings.xml','app/src/main/res/values-ja/strings.xml']){
      const value=read(file)
      for(const key of ['onboarding_settings_title','onboarding_welcome_title','onboarding_start','onboarding_skip','tour_library_title','tour_recommend_settings_title','tour_complete_title']){
        expect(value).toContain(`name="${key}"`)
      }
    }
  })
})
