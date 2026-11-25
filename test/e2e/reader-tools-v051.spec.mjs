import {test,expect} from '@playwright/test'
test('desktop library actions work with keyboard and fit a narrow window',async({page})=>{
 await page.setViewportSize({width:900,height:700})
 await page.addInitScript(()=>localStorage.setItem('pica-onboarding-state-v1',JSON.stringify({completedVersion:2,dismissedVersion:0,autoShow:true})))
 await page.route('**/api/v1/**',r=>r.fulfill({status:503,json:{error:'isolated offline fixture'}}))
 await page.goto('/');await expect(page.locator('#mode')).not.toHaveText('正在检测模式')
 if(await page.locator('#pica-disclaimer-gate').isVisible()){await page.locator('#pica-disclaimer-check').check();await page.locator('#pica-disclaimer-accept').click()}
 await page.locator('nav [data-view="library"]').click()
 const bar=page.locator('.reader-actions')
 await expect(bar.locator('#ux-library-filters summary')).toBeVisible()
 await bar.locator('#reader-shuffle').click();await expect(bar.locator('#sort-mode')).toHaveValue('shuffle')
 const shuffle=await page.evaluate(async()=>{const {stableShuffle}=await import('/reader-ux-051.js');const books=['a','b','c','d'].map(comicId=>({comicId}));const a=stableShuffle(books).map(x=>x.comicId).join();const b=stableShuffle(books).map(x=>x.comicId).join();document.querySelector('#reader-shuffle').click();const c=stableShuffle(books).map(x=>x.comicId).join();return {stable:a===b,newOrder:a!==c}})
 expect(shuffle).toEqual({stable:true,newOrder:true})
 await bar.locator('#reader-inbox').focus();await page.keyboard.press('Enter');await expect(page.locator('#reader-inbox-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(bar.locator('#reader-inbox')).toBeFocused()
 expect(await bar.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true)
})
