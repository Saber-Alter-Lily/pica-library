from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def patch(rel, old, new):
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    if s.count(old) != 1:
        raise RuntimeError(f'{rel}: expected one anchor for {old[:80]!r}, got {s.count(old)}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

patch(
    'src/recommendation-v3/ranker-adapter-v3.ts',
    "    feedbackAdjustment?: number\n    visual?: unknown\n",
    "    feedbackAdjustment?: number\n",
)
patch(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "                        feedbackAdjustment: item.feedbackAdjustment,\n                        visual: item.visual\n",
    "                        feedbackAdjustment: item.feedbackAdjustment,\n                        visual: (item as { visual?: unknown }).visual\n",
)
patch(
    'test/unit/recommendation-v4-visual.test.ts',
    "        }\n    }\n}\n\ndescribe('Recommendation V4 visual style core'",
    "        }\n    } as unknown as RankedCandidateWithEvidenceV3\n}\n\ndescribe('Recommendation V4 visual style core'",
)

for rel in ['scripts/v4_fix_types.py', '.github/workflows/v4-fix-types.yml']:
    try:
        (ROOT / rel).unlink()
    except FileNotFoundError:
        pass
print('V4 type fixes applied')
