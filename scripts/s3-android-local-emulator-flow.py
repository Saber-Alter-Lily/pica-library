#!/usr/bin/env python3
"""Operate the actual isolated Android QA APK via ADB and system SAF UI.

Uses Python's standard library, Android's own UI hierarchy and the original
application files. No extra test framework, simulated Reader or source login.
"""
import json
import re
import struct
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

PACKAGE = "com.picalibrary.android.localcore.qa"
ROOT = Path("mobile/android-alpha2/s3-local-emulator-evidence")
ROOT.mkdir(parents=True, exist_ok=True)
STEP = "setup"
CHECKS = []


def run(*parts, timeout=45, check=True, binary=False):
    result = subprocess.run(parts, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError(f"command {parts[:5]} failed ({result.returncode}): "
                           + result.stderr.decode(errors="replace")[-500:])
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()


def adb(*args, timeout=45, check=True, binary=False):
    return run("adb", *args, timeout=timeout, check=check, binary=binary)


def page(label):
    global STEP
    STEP = label
    shot = adb("exec-out", "screencap", "-p", binary=True)
    if not shot.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(f"Invalid emulator screenshot at {label}")
    (ROOT / f"{label}.png").write_bytes(shot)
    hierarchy(label)


def hierarchy(name="latest"):
    adb("shell", "uiautomator", "dump", "/sdcard/s3-local-window.xml", timeout=38)
    data = adb("exec-out", "cat", "/sdcard/s3-local-window.xml", binary=True)
    if b"<hierarchy" not in data:
        raise RuntimeError(f"No native UI hierarchy: {data[:160]!r}")
    (ROOT / f"{name}.xml").write_bytes(data)
    return ET.fromstring(data)


def nodes():
    root = hierarchy()
    return [(node.attrib.get("text", ""), node.attrib.get("content-desc", ""),
             node.attrib.get("bounds", ""), node.attrib.get("class", ""))
            for node in root.iter("node")]


def find(terms, exact=False, only_class=None):
    terms = (terms,) if isinstance(terms, str) else terms
    for label, desc, bounds, kind in nodes():
        if only_class and only_class not in kind:
            continue
        if any((label.casefold() == word.casefold() or desc.casefold() == word.casefold())
               if exact else
               (word.casefold() in label.casefold() or word.casefold() in desc.casefold())
               for word in terms):
            match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                if x2 > x1 and y2 > y1:
                    return ((x1+x2)//2, (y1+y2)//2, label or desc)
    return None


def wait(terms, seconds=35, exact=False, required=True, only_class=None):
    end = time.monotonic() + seconds
    last = None
    while time.monotonic() < end:
        try:
            last = find(terms, exact=exact, only_class=only_class)
            if last:
                return last
        except (RuntimeError, ET.ParseError):
            pass
        time.sleep(.65)
    if required:
        readable = [(text or desc)[:90] for text, desc, bounds, _ in nodes()
                    if (text or desc).strip()]
        raise AssertionError(f"{STEP}: could not see {terms!r}; visible={readable[:45]}")
    return None


def tap(terms, seconds=35, exact=False, only_class=None):
    x, y, label = wait(terms, seconds=seconds, exact=exact, only_class=only_class)
    adb("shell", "input", "tap", str(x), str(y))
    print(f"UI tap: {label!r} ({x},{y})", flush=True)


def record(label):
    CHECKS.append(label)
    print(f"PASS: {label}", flush=True)


def app_file(path):
    return adb("exec-out", "run-as", PACKAGE, "cat", path)


def ledger(path):
    return json.loads(app_file("files/" + path))


def until_data(path, valid, seconds=30):
    end=time.monotonic()+seconds
    last=None
    while time.monotonic()<end:
        try:
            last=ledger(path)
            if valid(last):
                return last
        except (RuntimeError, OSError, ValueError):
            pass
        time.sleep(.5)
    raise AssertionError(f"{STEP}: {path} did not reach expected state; last={str(last)[:250]}")


def original_png(red, green, blue):
    width, height = 180, 240
    rows = []
    for y in range(height):
        rows.append(b"\x00" + bytes((red, green, blue)) * width)
    payload = zlib.compress(b"".join(rows), level=6)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", payload) + chunk(b"IEND", b""))


def fixtures():
    staging = ROOT / "fixture"
    staging.mkdir(exist_ok=True)
    png1 = original_png(120, 175, 210)
    png2 = original_png(210, 175, 100)
    png3 = original_png(150, 190, 115)
    archive = staging / "S3-QA-Comic.cbz"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("Chapter01/001.png", png1)
        z.writestr("Chapter01/002.png", png2)
        z.writestr("Chapter01/003.png", png3)
        z.writestr("Chapter02/001.png", png1)
    folder = staging / "S3-QA-Folder"
    folder.mkdir(exist_ok=True)
    (folder / "001.png").write_bytes(png1)
    (folder / "002.png").write_bytes(png2)
    adb("shell", "mkdir", "-p", "/sdcard/Download/S3-QA-Folder")
    adb("push", str(archive), "/sdcard/Download/S3-QA-Comic.cbz")
    for name in ("001.png", "002.png"):
        adb("push", str(folder / name), "/sdcard/Download/S3-QA-Folder/" + name)
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
        "-d", "file:///sdcard/Download/S3-QA-Comic.cbz", check=False)
    record("created isolated CBZ and folder fixtures on emulator /Download")


def locate_document(name):
    if wait(name, seconds=12, required=False):
        tap(name)
        return
    for picker in (("Show roots", "Show navigation drawer", "Open navigation drawer",
                    "Navigate up", "Browse"), ("Downloads",)):
        found = wait(picker, seconds=8, required=False)
        if found:
            tap(picker)
            time.sleep(.7)
    tap(name, seconds=25)


def import_cbz():
    page("01-empty-library")
    tap(("Import CBZ", "导入 CBZ", "CBZ 取込"))
    page("02-system-picker")
    locate_document("S3-QA-Comic.cbz")
    tap(("Save to library", "保存到书库", "書庫に保存"), seconds=55)
    # The post-commit status is intentionally transient; the library row is stable.
    wait(("4 pages", "4 页", "4 ページ"), seconds=55)
    comic = ledger("local-comics-v1/" + local_manifest_id() + "/manifest.json")
    assert comic["kind"] == "cbz" and len(comic["pages"]) == 4, comic
    page("03-cbz-imported")
    record("system SAF CBZ picker -> preview/confirm -> original 4-page local manifest")
    return comic


def local_manifest_id():
    names = adb("exec-out", "run-as", PACKAGE, "ls", "files/local-comics-v1").split()
    matched = [name for name in names if re.fullmatch(r"[0-9a-f]{64}", name)]
    if not matched:
        raise AssertionError("Original local library has no committed comic")
    return matched[0]


def book_rows():
    entries = []
    dirs = adb("exec-out", "run-as", PACKAGE, "ls", "files/local-comics-v1").split()
    for d in dirs:
        if re.fullmatch(r"[0-9a-f]{64}", d):
            entries.append(ledger(f"local-comics-v1/{d}/manifest.json"))
    return entries


def shelf_flow(comic):
    tap(("Shelves", "书架", "本棚"))
    tap(("New shelf", "新建书架", "新しい本棚"))
    editable = wait(("",), seconds=12, only_class="EditText")
    adb("shell", "input", "tap", str(editable[0]), str(editable[1]))
    adb("shell", "input", "text", "QA_Shelf")
    # Do not mistake the "Create shelf" dialog TITLE for its CREATE button.
    tap(("Create", "创建", "作成"), seconds=15, exact=True, only_class="Button")
    wait("QA_Shelf ·", seconds=30)
    tap("QA_Shelf ·")
    tap(("Add comic", "加入作品", "作品を追加"))
    tap("S3-QA-Comic")
    shelf = until_data("portable-shelves-v1.json",
        lambda root: any(any(x["comicId"] == comic["id"] and not x["deletedAt"]
                for x in s["items"]) for s in root["shelves"])) 
    active = [s for s in shelf["shelves"] if not s["deletedAt"]]
    assert len(active) == 1 and len([x for x in active[0]["items"]
                                    if x["comicId"] == comic["id"] and not x["deletedAt"]]) == 1
    page("04-shelf-member")
    record("original shelf schema-2 create/add membership persists locally")


def wait_page_counter(value, seconds=35):
    # The original Reader automatically hides its chrome after page display.
    if not wait(value, seconds=6, required=False):
        adb("shell", "input", "tap", "360", "480")
        wait(value, seconds=seconds)


def reader_flow():
    tap("S3-QA-Comic")
    wait_page_counter("1 / 3", seconds=35)
    page("05-reader-first-page")
    # Original Reader chrome auto-hides. A center tap reveals the existing controls.
    if not wait("下一页", seconds=3, required=False):
        adb("shell", "input", "tap", "360", "480")
    tap("下一页", seconds=12)
    wait_page_counter("2 / 3", seconds=28)
    time.sleep(1.2)  # Save only after the original bitmap holder completed loading.
    page("06-reader-second-page")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    history = ledger("reading-history-v1.json")
    sessions = [row for row in history["sessions"] if row.get("sourceKind") == "local"]
    assert sessions and max(row["lastPage"] for row in sessions) >= 1, history
    record("original ViewPager2 Reader advanced a real image and persisted session/page")


def return_to_library():
    # Android 35 can show its one-time immersive-mode education after a Reader
    # screen. That is system UI, not the application's shelf or Reader content.
    for _ in range(5):
        if wait(("Shelves", "书架", "本棚"), seconds=4, required=False):
            return
        if wait(("Got it", "知道了", "了解"), seconds=3, required=False):
            tap(("Got it", "知道了", "了解"), seconds=4, exact=True)
            continue
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    wait(("Shelves", "书架", "本棚"), seconds=12)


def restart_history(comic):
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        PACKAGE + "/com.picalibrary.android.LocalLibraryActivity", timeout=40)
    tap(("Reading history", "History", "阅读历史", "閲覧履歴"), seconds=25)
    wait("S3-QA-Comic", seconds=25)
    page("07-history-after-force-stop")
    tap("S3-QA-Comic")
    wait_page_counter("2 / 3", seconds=30)
    page("08-reader-resumed-from-history")
    return_to_library()
    record("force-stop/relaunch -> original history record -> same chapter and page")


def remove_member_without_deleting(comic):
    tap(("Shelves", "书架", "本棚"), seconds=25)
    tap("QA_Shelf")
    x, y, _ = wait("S3-QA-Comic")
    adb("shell", "input", "swipe", str(x), str(y), str(x), str(y), "1400")
    tap(("Remove", "移出", "外す"), exact=True, only_class="Button")
    shelf = until_data("portable-shelves-v1.json",
        lambda root: bool(root["shelves"][0]["items"]) and
            all(item["deletedAt"] for item in root["shelves"][0]["items"]))
    items = shelf["shelves"][0]["items"]
    assert items and all(item["deletedAt"] for item in items), shelf
    assert comic["id"] in [x["id"] for x in book_rows()]
    page("09-shelf-tombstone")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    return_to_library()
    record("shelf removal writes original tombstone without deleting the imported comic")


def import_folder():
    tap(("Import folder", "导入文件夹", "フォルダー取込"))
    page("10-folder-picker")
    locate_document("S3-QA-Folder")
    tap(("Use this folder", "使用此文件夹", "このフォルダを使用"), seconds=18)
    if wait(("Allow", "允许", "許可"), seconds=12, required=False):
        tap(("Allow", "允许", "許可"))
    tap(("Save to library", "保存到书库", "書庫に保存"), seconds=50)
    wait(("2 pages", "2 页", "2 ページ"), seconds=45)
    found = [x for x in book_rows() if x["kind"] == "folder" and len(x["pages"]) == 2]
    assert found, book_rows()
    page("11-folder-imported")
    record("system SAF folder picker -> original local storage with two valid pages")


def main():
    global STEP
    try:
        STEP = "fixtures"
        adb("shell", "wm", "size", "720x1280")
        adb("shell", "wm", "density", "320")
        fixtures()
        adb("shell", "settings", "put", "system", "font_scale", "1.0")
        adb("shell", "am", "start", "-W", "-n",
            PACKAGE + "/com.picalibrary.android.LocalLibraryActivity")
        wait(("Import CBZ", "导入 CBZ", "CBZ 取込"), seconds=25)
        comic = import_cbz()
        shelf_flow(comic)
        reader_flow()
        restart_history(comic)
        remove_member_without_deleting(comic)
        import_folder()
        (ROOT / "results.json").write_text(json.dumps({
            "result": "PASS", "source_sha": __import__("os").environ.get("GITHUB_SHA", ""),
            "checks": CHECKS, "browser": "Android 35 emulator ADB real app",
            "package": PACKAGE}, ensure_ascii=False, indent=2), encoding="utf-8")
        print("S3 LOCAL END-TO-END PASS", flush=True)
    except Exception as error:
        print(f"S3 LOCAL END-TO-END FAIL at {STEP}: {error}", file=sys.stderr, flush=True)
        (ROOT / "results.json").write_text(json.dumps({
            "result": "FAIL", "step": STEP, "error": str(error), "checks": CHECKS
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            page("failure-" + re.sub("[^a-z0-9-]", "-", STEP.lower())[:48])
        except Exception as capture_error:
            print(f"Diagnostic capture failed: {capture_error}", file=sys.stderr)
        raise
    finally:
        trace = adb("logcat", "-d", "-s", "AndroidRuntime:E", "ActivityTaskManager:W",
                    check=False, timeout=25)
        (ROOT / "android-runtime.log").write_text(trace, encoding="utf-8")
        adb("shell", "wm", "size", "reset", check=False)
        adb("shell", "wm", "density", "reset", check=False)


if __name__ == "__main__":
    main()
