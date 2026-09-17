from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / 'test/unit/recommendation-v5-portable-policy.test.ts'
text = target.read_text(encoding='utf-8')
old = """    return {\n        comicId: input.comicId,\n        title: input.title,\n        author: input.author ?? '',"""
new = """    return {\n        ...input,\n        comicId: input.comicId,\n        title: input.title,\n        author: input.author ?? '',"""
if old not in text:
    raise SystemExit('test helper prefix not found')
text = text.replace(old, new, 1)
old_tail = """        pagesCount: input.pagesCount ?? 0,\n        inLibrary: input.inLibrary ?? false,\n        ...input\n    } as StoredComic"""
new_tail = """        pagesCount: input.pagesCount ?? 0,\n        inLibrary: input.inLibrary ?? false\n    } as StoredComic"""
if old_tail not in text:
    raise SystemExit('test helper tail not found')
text = text.replace(old_tail, new_tail, 1)
target.write_text(text, encoding='utf-8')
Path(__file__).unlink()
print('Recommendation V5 test helper fixed')
