import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const javaRoot = path.join(ROOT, 'mobile/android-alpha2/app/src/main/java')
const webRoot = path.join(ROOT, 'web')
const outDir = path.join(ROOT, '_reports')
fs.mkdirSync(outDir, { recursive: true })

function walk(dir, accept) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) out.push(...walk(p, accept))
    else if (accept(p)) out.push(p)
  }
  return out
}

function rel(p) { return path.relative(ROOT, p).replaceAll('\\', '/') }
const han = /[\u3400-\u9fff]/
const quoted = /"((?:\\.|[^"\\])*)"/g

function closeIndex(src, open, openChar = '(', closeChar = ')') {
  let depth = 0, quote = '', escape = false
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === openChar) depth++
    else if (ch === closeChar && --depth === 0) return i
  }
  return -1
}

function callRanges(src, regex) {
  const ranges = []
  let match
  while ((match = regex.exec(src))) {
    const open = src.indexOf('(', match.index)
    if (open < 0) continue
    const close = closeIndex(src, open)
    if (close > open) ranges.push([open, close])
  }
  return ranges
}
function inRanges(index, ranges) { return ranges.some(([a,b]) => index > a && index < b) }

function semanticLocalizedRanges(src) {
  return callRanges(src, /LocalizedText\.ui\s*\(/g).filter(([open, close]) => {
    let depth = 0, quote = '', escape = false, commas = 0
    for (let i = open + 1; i < close; i++) {
      const ch = src[i]
      if (quote) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === quote) quote = ''
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--
      else if (ch === ',' && depth === 0) commas++
    }
    return commas >= 3
  })
}

function localizedArrayRanges(src) {
  const ranges = []
  const re = /String\[\]\s+(\w+)\s*=/g
  let match
  while ((match = re.exec(src))) {
    const name = match[1]
    if (!new RegExp(`LocalizedText\\.ui\\(\\s*${name}\\s*\\)`).test(src)) continue
    let quote = '', escape = false, end = -1
    for (let i = re.lastIndex; i < src.length; i++) {
      const ch = src[i]
      if (quote) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === quote) quote = ''
        continue
      }
      if (ch === '"' || ch === "'") { quote = ch; continue }
      if (ch === ';') { end = i; break }
    }
    if (end > re.lastIndex) ranges.push([re.lastIndex, end])
  }
  return ranges
}

function literals(file) {
  const src = fs.readFileSync(file, 'utf8')
  const rows = []
  const primitiveRanges = callRanges(
    src,
    /(?:Ui\.(?:text|button|pill|stylePill|foldHeader|headingWithInfo|infoButton|iconButton)|SettingsRow\.(?:row|statusLine)|\b(?:compact|primaryButton|titleRow))\s*\(/g
  )
  const directRanges = callRanges(
    src,
    /(?:\.(?:setText|setHint|setTitle|setMessage|setPositiveButton|setNegativeButton|setNeutralButton|setItems|setSingleChoiceItems|setMultiChoiceItems|setContentDescription|setSummary|setLabel)|Toast\.makeText)\s*\(/g
  )
  const localizedRanges = callRanges(src, /LocalizedText\.ui\s*\(/g)
  const semanticRanges = semanticLocalizedRanges(src)
  const arrayRanges = localizedArrayRanges(src)

  quoted.lastIndex = 0
  let m
  while ((m = quoted.exec(src))) {
    const value = m[1].replace(/\\"/g, '"')
    if (!han.test(value)) continue
    const line = src.slice(0, m.index).split('\n').length
    const coveredPrimitive = inRanges(m.index, primitiveRanges)
    const directUi = inRanges(m.index, directRanges)
    const explicitlyRouted = inRanges(m.index, localizedRanges)
    const semanticRouted = inRanges(m.index, semanticRanges)
    const arrayRouted = inRanges(m.index, arrayRanges)
    const likelyUi = coveredPrimitive || directUi || arrayRouted || semanticRouted
    const uiRouted = coveredPrimitive || explicitlyRouted || arrayRouted || semanticRouted
    rows.push({ file: rel(file), line, value, likelyUi, coveredPrimitive, directUi, explicitlyRouted, semanticRouted, arrayRouted, uiRouted })
  }
  return rows
}

const javaFiles = walk(javaRoot, p => p.endsWith('.java'))
const webFiles = walk(webRoot, p => /\.(?:js|html)$/.test(p) && !p.endsWith('/i18n.js') && !p.includes('/vendor/'))
const androidRows = javaFiles.flatMap(literals)
const webRows = webFiles.flatMap(literals)

const result = {
  generatedAt: new Date().toISOString(),
  android: {
    filesScanned: javaFiles.length,
    hanLiteralCount: androidRows.length,
    likelyUiCount: androidRows.filter(x => x.likelyUi).length,
    filesWithHan: [...new Set(androidRows.map(x => x.file))].length,
    rows: androidRows
  },
  webOutsideI18n: {
    filesScanned: webFiles.length,
    hanLiteralCount: webRows.length,
    filesWithHan: [...new Set(webRows.map(x => x.file))].length,
    rows: webRows
  }
}
console.log('LOCALIZATION_INVENTORY')
console.log(JSON.stringify({
  androidFilesScanned: result.android.filesScanned,
  androidHanLiteralCount: result.android.hanLiteralCount,
  androidLikelyUiCount: result.android.likelyUiCount,
  androidFilesWithHan: result.android.filesWithHan,
  webFilesScanned: result.webOutsideI18n.filesScanned,
  webHanLiteralCount: result.webOutsideI18n.hanLiteralCount,
  webFilesWithHan: result.webOutsideI18n.filesWithHan
}, null, 2))
console.log('TOP_ANDROID_FILES')
const counts = new Map()
for (const row of androidRows) counts.set(row.file, (counts.get(row.file) || 0) + 1)
console.log([...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([f,n])=>`${n}\t${f}`).join('\n'))
console.log('ANDROID_UNIQUE_LIKELY_UI=' + new Set(androidRows.filter(x=>x.likelyUi).map(x=>x.value)).size)
console.log('ANDROID_COVERED_PRIMITIVE=' + androidRows.filter(x=>x.coveredPrimitive).length)
console.log('ANDROID_DIRECT_UI=' + androidRows.filter(x=>x.directUi&&!x.coveredPrimitive).length)
console.log('ANDROID_DIRECT_UI_UNIQUE=' + new Set(androidRows.filter(x=>x.directUi&&!x.coveredPrimitive).map(x=>x.value)).size)
console.log('ANDROID_EXPLICITLY_ROUTED=' + androidRows.filter(x=>x.explicitlyRouted).length)

const localeDir = path.join(ROOT, 'mobile/android-alpha2/app/src/main/assets/locales')
const mergedCatalog = { byLanguage: { en: {}, ja: {}, 'zh-CN': {} } }
if (fs.existsSync(localeDir)) {
  for (const name of fs.readdirSync(localeDir).filter(name => name.endsWith('.json')).sort()) {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(localeDir, name), 'utf8'))
      for (const language of Object.keys(mergedCatalog.byLanguage))
        Object.assign(mergedCatalog.byLanguage[language], value.byLanguage?.[language] || {})
    } catch {}
  }
}
const uiUnique = [...new Set(androidRows.filter(x => x.likelyUi && x.uiRouted && !x.semanticRouted).map(x => x.value))]
const unroutedDirectRows = androidRows.filter(x => x.directUi && !x.coveredPrimitive && !x.explicitlyRouted)
const unroutedDirectUnique = [...new Set(unroutedDirectRows.map(x => x.value))]
const hasTranslation = (language, value) => Object.prototype.hasOwnProperty.call(mergedCatalog.byLanguage?.[language] || {}, value)
const missingEn = uiUnique.filter(value => /[\u3400-\u9fff]/.test(value) && !hasTranslation('en', value))
const missingJa = uiUnique.filter(value => /[\u3400-\u9fff]/.test(value) && !hasTranslation('ja', value))

result.android.unroutedDirectUiCount = unroutedDirectRows.length
result.android.unroutedDirectUiUnique = unroutedDirectUnique
result.android.routedUiUniqueCount = uiUnique.length
result.android.missingEnglishUi = missingEn
result.android.missingJapaneseUi = missingJa
fs.writeFileSync(path.join(outDir, 'localization-inventory.json'), JSON.stringify(result, null, 2) + '\n')

console.log('ANDROID_DIRECT_UNROUTED=' + unroutedDirectRows.length)
console.log('ANDROID_DIRECT_UNROUTED_UNIQUE=' + unroutedDirectUnique.length)
console.log('ANDROID_UI_MISSING_EN=' + missingEn.length)
console.log('ANDROID_UI_MISSING_JA=' + missingJa.length)
console.log('ANDROID_DIRECT_UNROUTED_VALUES')
console.log(unroutedDirectUnique.join('\n'))
console.log('ANDROID_UI_MISSING_EN_VALUES')
console.log(missingEn.join('\n'))
console.log('ANDROID_UI_MISSING_JA_VALUES')
console.log(missingJa.join('\n'))

console.log('DIRECT_UI_SAMPLES')
console.log(androidRows.filter(x=>x.directUi&&!x.coveredPrimitive).slice(0,220).map(x=>`${x.file}:${x.line}\t${x.value}`).join('\n'))
console.log('LIKELY_UI_SAMPLES')
console.log(androidRows.filter(x=>x.likelyUi).slice(0,120).map(x=>`${x.file}:${x.line}\t${x.value}`).join('\n'))
console.log('TOP_WEB_FILES')
const webCounts = new Map()
for (const row of webRows) webCounts.set(row.file, (webCounts.get(row.file) || 0) + 1)
console.log([...webCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([f,n])=>`${n}\t${f}`).join('\n'))
console.log('WEB_UNIQUE_HAN=' + new Set(webRows.map(x=>x.value)).size)
console.log('WEB_HAN_SAMPLES')
console.log(webRows.slice(0,180).map(x=>`${x.file}:${x.line}\t${x.value}`).join('\n'))
