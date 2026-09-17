from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace(path, old, new, count=1):
    target = root / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing {path}: {old!r}')
    target.write_text(text.replace(old, new, count), encoding='utf-8')

# V5 inferred controls intentionally use explicit favorites only. Mere library
# membership is ownership, not positive preference evidence.
replace(
    'test/unit/recommendation-v5-portable-policy.test.ts',
    "expect(signals.find((item) => item.targetType === 'AUTHOR')?.supportCount).toBe(2)",
    "expect(signals.find((item) => item.targetType === 'AUTHOR')?.supportCount).toBe(1)"
)
replace(
    'test/unit/recommendation-v5-portable-policy.test.ts',
    "expect(signals.find((item) => item.targetType === 'TAG' && item.key === 't')?.supportCount).toBe(2)",
    "expect(signals.find((item) => item.targetType === 'TAG' && item.key === 't')?.supportCount).toBe(1)"
)

# Repository policy requires short-lived CI artifacts for all workflows.
workflow = root / '.github/workflows/recommendation-v5-beta-build.yml'
text = workflow.read_text(encoding='utf-8')
if 'retention-days: 3' not in text:
    raise SystemExit('beta workflow retention value not found')
workflow.write_text(text.replace('retention-days: 3', 'retention-days: 1'), encoding='utf-8')

Path(__file__).unlink()
print('Recommendation V5 second validation fixes applied')
