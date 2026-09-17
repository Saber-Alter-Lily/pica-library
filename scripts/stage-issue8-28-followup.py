from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# app.js ordinary UI strings must remain localized.
replace_once(
    'web/app.js',
    'id="download-load-more">加载更多（${jobs.length} / ${Number(page.total || 0)}）</button>',
    'id="download-load-more">${t(\'library.loadMore\')}（${jobs.length} / ${Number(page.total || 0)}）</button>',
)

# Schema 10 remains the visual embedding migration; queue scale indexes are additive schema 11.
replace_once(
    'test/unit/recommendation-v4-integration.test.ts',
    """    it('adds additive schema 10 visual storage', () => {
        expect(latestMigrationVersion).toBe(10)""",
    """    it('keeps schema 10 visual storage while later additive migrations advance the database', () => {
        expect(latestMigrationVersion).toBe(11)""",
)

# Web author navigation now actively completes provider results instead of only showing local catalog matches.
replace_once(
    'test/unit/v040-web-multi-provider-parity.test.ts',
    """    expect(web).toContain('authorIds:[authorId]')
    expect(web).toContain('默认合并 Pica 与 E-H')""",
    """    expect(web).toContain('authorIds:[authorId]')
    expect(web).toContain('/api/v1/authors/${encodeURIComponent(authorId)}/refresh')
    expect(web).toContain('正在联网补全 Pica / E-H 作者作品')""",
)
