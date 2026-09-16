import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = (relative) => path.join(root, relative)

const styles = `\n.recommend-feedback { display:flex; gap:.45rem; margin-top:.65rem; flex-wrap:wrap; }\n.recommend-feedback button { min-width:5.5rem; }\n.recommend-feedback button.active { outline:2px solid currentColor; font-weight:700; }\n.feedback-reasons { display:grid; gap:.55rem; margin:1rem 0; }\n.toggle-row { display:flex; align-items:center; gap:.55rem; }\n#settings-recommendation-v4 progress { width:100%; }\n.visual-similar-item { display:flex; flex-direction:column; gap:.2rem; padding:.7rem; border:1px solid var(--border, #ddd); border-radius:.6rem; }\n`
fs.appendFileSync(file('web/styles.css'), styles, 'utf8')

const zh = `        'recommend.feedbackLabel': '推荐反馈',\n        'recommend.like': '喜欢',\n        'recommend.dislike': '不喜欢',\n        'recommend.whyLike': '为什么喜欢？（可选）',\n        'recommend.whyDislike': '为什么不喜欢？（可选）',\n        'visual.similarStyle': '相似画风',\n        'visual.similarFound': '找到 {count} 本画风相近作品。',\n        'visual.similarEmpty': '这本作品还没有可比较的画风向量。',\n        'visual.indexStatus': '画风索引：{indexed}/{target}，待分析 {pending}。',\n        'visual.processing': '正在分析 {current}/{total}…',\n        'visual.processingPage': '正在分析 {current}/{total} · 页面 {page}/{pages}',\n        'visual.loadingModel': '正在加载本地视觉模型…',\n        'visual.itemFailed': '第 {current}/{total} 本分析失败：{error}',\n        'visual.stopped': '画风索引已停止，可稍后继续。',\n        'visual.finished': '画风索引本轮完成，已建立 {indexed} 本。',\n`
const en = `        'recommend.feedbackLabel': 'Recommendation feedback',\n        'recommend.like': 'Like',\n        'recommend.dislike': 'Dislike',\n        'recommend.whyLike': 'Why did you like it? (optional)',\n        'recommend.whyDislike': 'Why did you dislike it? (optional)',\n        'visual.similarStyle': 'Similar style',\n        'visual.similarFound': 'Found {count} visually similar works.',\n        'visual.similarEmpty': 'This work does not have a comparable visual vector yet.',\n        'visual.indexStatus': 'Style index: {indexed}/{target}, {pending} pending.',\n        'visual.processing': 'Analyzing {current}/{total}…',\n        'visual.processingPage': 'Analyzing {current}/{total} · page {page}/{pages}',\n        'visual.loadingModel': 'Loading the local visual model…',\n        'visual.itemFailed': 'Item {current}/{total} failed: {error}',\n        'visual.stopped': 'Style indexing stopped. You can resume later.',\n        'visual.finished': 'Style indexing complete for this run: {indexed} indexed.',\n`
let i18n = fs.readFileSync(file('web/i18n.js'), 'utf8')
const needle = "        'recommend.exhausted':"
const indexes = []
let offset = 0
while (true) {
    const index = i18n.indexOf(needle, offset)
    if (index < 0) break
    indexes.push(index)
    offset = index + needle.length
}
if (indexes.length !== 2)
    throw new Error(`Expected exactly two recommend.exhausted translation anchors, found ${indexes.length}`)
for (const [index, addition] of [
    [indexes[1], en],
    [indexes[0], zh]
])
    i18n = i18n.slice(0, index) + addition + i18n.slice(index)
fs.writeFileSync(file('web/i18n.js'), i18n, 'utf8')

for (const relative of [
    'scripts/fix-recommendation-v4-apply.mjs',
    'scripts/post-recommendation-v4-apply.mjs'
])
    fs.rmSync(file(relative), { force: true })

console.log('Recommendation V4 post-integration hardening complete')
