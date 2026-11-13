#!/usr/bin/env python3
"""Verify source-neutral full original Android APK DEX AND R8 mapping.

Shared by ordinary QA and the fixed-preview-signer release-candidate lane.
This is a source exclusion gate, not a claim that the user already tested UI.
"""
import os
import re
import sys
import zipfile

def main():
    if len(sys.argv)!=3:
        raise SystemExit("Usage: verify-android-clean-source-apk.py APK_FILE R8_MAPPING")
    os.environ["APP"]=sys.argv[1]
    mapping_path=sys.argv[2]
    root = os.environ['APP']
    with zipfile.ZipFile(root) as apk:
        dex = [apk.read(n) for n in apk.namelist()
               if re.fullmatch(r'classes[0-9]*\.dex', n)]
        if not dex:
            raise SystemExit('No compiled Android DEX')
        contents = b''.join(dex)
        direct = [x for x in (
            b'Lio/github/jukomu/',
            b'Lorg/picalibrary/sources/JmSource;',
            b'PicaAccountActivity', b'EhAccountActivity',
            b'JmSourceActivity', b'PicaBrowseActivity')
            if x in contents]
    mapping = mapping_path
    if not os.path.isfile(mapping):
        raise SystemExit('R8 mapping missing: no physical source proof')
    lines = open(mapping, encoding='utf-8').read().splitlines()
    expected_excluded = (
        'com.picalibrary.android.PicaClient',
        'com.picalibrary.android.EhClient',
        'com.picalibrary.android.JmClientManager',
        'com.picalibrary.android.JmSourceActivity',
        'org.picalibrary.sources.JmSource',
        'io.github.jukomu.')
    leaked = [line.split(' -> ')[0] for line in lines if ' -> ' in line
              and line.startswith(expected_excluded)]
    print('SOURCE_NEUTRAL_APK_AUDIT', {'dex_count': len(dex),
          'source_leaks': leaked[:25], 'direct_forbidden': [repr(x) for x in direct]}, flush=True)
    if leaked or direct:
        raise SystemExit('UNVERIFIED: bundled legacy provider remains physically reachable')
    print('PASS: original product clean-source QA DEX contains no listed bundled providers')
if __name__ == "__main__":
    main()
