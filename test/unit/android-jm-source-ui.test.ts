import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const app = path.resolve('mobile/android-alpha2/app/src/main')
const strings = (locale: string) => {
  const xml = fs.readFileSync(path.join(app, 'res', locale, 'strings.xml'), 'utf8')
  return Object.fromEntries([...xml.matchAll(/<string name="(jm_source_[^"]+)">([^]*?)<\/string>/g)].map(match => [match[1], match[2]]))
}

describe('JM phone source semantic resource contract', () => {
  const base = strings('values')
  it('covers every source-screen resource in all supported locales', () => {
    const screen = fs.readFileSync(path.join(app, 'java/com/picalibrary/android/JmSourceActivity.java'), 'utf8')
    const used = [...new Set([...screen.matchAll(/R\.string\.(jm_source_\w+)/g)].map(match => match[1]))].sort()
    expect(used.length).toBeGreaterThan(60)
    expect(Object.keys(base).sort()).toEqual(used)
    for (const locale of ['values-zh-rCN', 'values-ja']) expect(Object.keys(strings(locale)).sort()).toEqual(used)
  })
  it('preserves numbered formatting arguments and avoids malformed Android quotes', () => {
    for (const locale of ['values', 'values-zh-rCN', 'values-ja']) {
      for (const [key, text] of Object.entries(strings(locale))) {
        expect(text.match(/%\d+\$[ds]/g) ?? [], key).toEqual(base[key].match(/%\d+\$[ds]/g) ?? [])
        expect(text, key).not.toMatch(/(?<!\\)'/)
      }
    }
  })
})
