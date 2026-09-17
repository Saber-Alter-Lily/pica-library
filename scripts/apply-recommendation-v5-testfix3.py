from pathlib import Path

root = Path(__file__).resolve().parents[1]
workflow = root / '.github/workflows/recommendation-v5-beta-build.yml'
text = workflow.read_text(encoding='utf-8')
old = """  web-and-desktop:\n    runs-on: ubuntu-latest\n"""
new = """  web-and-desktop:\n    if: github.event.repository.private == false && github.repository == 'Saber-Alter-Lily/pica-library'\n    runs-on: ubuntu-latest\n"""
if old not in text:
    raise SystemExit('Recommendation V5 beta job insertion point not found')
workflow.write_text(text.replace(old, new, 1), encoding='utf-8')

# Final integrated branch must not retain one-shot staging helpers.
for relative in [
    'scripts/apply-recommendation-v5-portable-policy.py',
    'scripts/apply-recommendation-v5-followup.py',
    'scripts/apply-recommendation-v5-testfix3.py',
]:
    target = root / relative
    if target.exists():
        target.unlink()
print('Recommendation V5 public-artifact gate and staging cleanup applied')
