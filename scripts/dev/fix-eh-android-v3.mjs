import fs from 'node:fs'

const file = 'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
let text = fs.readFileSync(file, 'utf8')
const broken = 'String q="AUTHOR".equals(route.type)?"artist:""+route.query.replace(""","")+""":route.query;'
const fixed = 'String q="AUTHOR".equals(route.type)?"artist:\\\""+route.query.replace("\\\"","")+"\\\"":route.query;'
const index = text.indexOf(broken)
if (index < 0) throw new Error('Broken E-H author query anchor not found')
if (text.indexOf(broken, index + broken.length) >= 0) throw new Error('Broken E-H author query anchor duplicated')
text = text.slice(0, index) + fixed + text.slice(index + broken.length)
fs.writeFileSync(file, text)
console.log('EH_ANDROID_V3_QUOTE_FIX=APPLIED')
