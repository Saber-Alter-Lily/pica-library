#!/usr/bin/env python3
"""Operate the actual isolated Android QA APK via ADB and system SAF UI.

Uses Python's standard library, Android's own UI hierarchy and the original
application files. No extra test framework, simulated Reader or source login.
"""
import json
import hashlib
import os
import tempfile
import urllib.request
import threading
import re
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import struct
import subprocess
import sys
import shlex
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

QA_PACKAGE = "com.picalibrary.android.localcore.qa"
ORIGINAL_PACKAGE = "com.picalibrary.android.dev"
CLEAN_PACKAGE = "com.picalibrary.android.cleanqa"
USER_HOST_PACKAGE = "com.picalibrary.android.userhost.qa"
PACKAGE = QA_PACKAGE
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


def installed_version_code(package):
    details = adb("shell", "dumpsys", "package", package)
    match = re.search(r"\bversionCode=(\d+)\b", details)
    if match is None:
        raise AssertionError(f"{STEP}: Android package version not reported for {package}")
    return int(match.group(1))


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



def tap_scrolling(terms, direction="down", only_class=None, attempts=13):
    """Find a visible native control on the existing scrollable Host screen."""
    for _ in range(attempts):
        selected = find(terms, only_class=only_class)
        if selected and 60 <= selected[0] <= 660 and 100 <= selected[1] <= 1200:
            x, y, title = selected
            adb("shell", "input", "tap", str(x), str(y))
            print(f"Host native UI tap: {title!r} ({x},{y})", flush=True)
            return
        if direction == "up":
            adb("shell", "input", "swipe", "360", "360", "360", "1010", "360")
        else:
            adb("shell", "input", "swipe", "360", "1010", "360", "360", "360")
    labels = [(text or desc)[:70] for text,desc,_,_ in nodes() if text or desc]
    raise AssertionError(f"{STEP}: Host UI item {terms!r} not visible; {labels[:30]}")


def type_into_host(hint, value):
    tap_scrolling(hint, only_class="EditText")
    adb("shell", "input", "text", value)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")


@contextmanager
def synthetic_user_host():
    """A real loopback-only Suwayomi 2.4 API with the original eight operations.

    The Android app connects through ADB reverse and its own HttpURLConnection.
    This exposes no real site, credentials or extension and never changes
    user data; it exercises the original Host parser and Reader end-to-end.
    """
    source = "-9223372036854775808"
    book = dict(id=7,sourceId=source,url="/synthetic/manga",
                title="S3-QA-Hosted-Comic",inLibrary=False)
    chapter = dict(id=11,mangaId=7,url="/synthetic/chapter",name="Synthetic chapter",
                   sourceOrder=0,pageCount=2,chapterNumber=1)
    first=original_png(135,185,215)
    second=original_png(215,185,120)
    operations=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            return
        def respond(self,data,content_type,code=200):
            self.send_response(code)
            self.send_header("Content-Type",content_type)
            self.send_header("Content-Length",str(len(data)))
            self.send_header("Cache-Control","no-store")
            self.send_header("Connection","close")
            self.end_headers()
            self.wfile.write(data)
        def do_GET(self):
            if self.path=="/api/v1/manga/7/chapter/0/page/0":
                return self.respond(first,"image/png")
            if self.path=="/api/v1/manga/7/chapter/0/page/1":
                return self.respond(second,"image/png")
            self.respond(b"not found","text/plain",404)
        def do_POST(self):
            if self.path!="/api/graphql":
                return self.respond(b"not found","text/plain",404)
            size=int(self.headers.get("Content-Length","0"))
            if size<1 or size>10000:
                return self.respond(b"invalid","text/plain",400)
            request=json.loads(self.rfile.read(size))
            name=request.get("operationName","")
            operations.append(name)
            if name=="PicaSourceHostInfo":
                data={"aboutServer":{"name":"Suwayomi-Server","version":"v2.4.2366"}}
            elif name=="PicaSourceHostSources":
                offset=int(request.get("variables",{}).get("offset",0))
                listed=[{"id":str(10000+i),"name":f"Other installed {i+1}",
                         "lang":"en","supportsLatest":True} for i in range(25)]
                listed.append({"id":source,"name":"User installed fixture",
                               "lang":"en","supportsLatest":True})
                data={"sources":{"nodes":listed[offset:offset+25],
                      "pageInfo":{"hasNextPage":offset+25<len(listed),
                                  "hasPreviousPage":offset>0},
                      "totalCount":len(listed)}}
            elif name=="PicaHostSourceSearch":
                search_page=int(request.get("variables",{}).get("input",{}).get("page",0))
                if search_page==1:
                    other=dict(book,id=8,url="/synthetic/first-page",
                               title="S3-QA-First-Page-Only")
                    data={"fetchSourceManga":{"mangas":[other],"hasNextPage":True}}
                elif search_page==2:
                    data={"fetchSourceManga":{"mangas":[book],"hasNextPage":False}}
                else:
                    data={"fetchSourceManga":{"mangas":[],"hasNextPage":False}}
            elif name=="PicaHostManga":
                data={"manga":dict(book,chapters={"nodes":[chapter]})}
            elif name=="PicaHostPrepareManga":
                data={"fetchMangaAndChapters":{"manga":book,"chapters":[chapter]}}
            elif name=="PicaHostChapter":
                data={"chapter":chapter}
            elif name=="PicaHostChapterPages":
                data={"fetchChapterPages":{"chapter":chapter,"pages":[
                     "/api/v1/manga/7/chapter/0/page/0",
                     "/api/v1/manga/7/chapter/0/page/1"]}}
            else:
                return self.respond(b"unsupported","text/plain",422)
            body=json.dumps({"data":data},separators=(",",":")).encode()
            self.respond(body,"application/json; charset=utf-8")
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    server.daemon_threads=True
    port=server.server_address[1]
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        adb("reverse",f"tcp:{port}",f"tcp:{port}")
        yield port,operations,(first,second)
    finally:
        adb("reverse","--remove",f"tcp:{port}",check=False)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def wait_host_operation(operations, operation, seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if operation in operations:return
        time.sleep(.35)
    raise AssertionError(f"{STEP}: expected real Host operation {operation}, got {operations!r}")


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
                    "Navigate up", "Browse"), ("Downloads", "Download")):
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


def button_in_snapshot(snapshot, label):
    for text, description, bounds, kind in snapshot:
        if not kind.endswith("Button") or not (
                text.casefold() == label.casefold() or
                description.casefold() == label.casefold()):
            continue
        match = re.search(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
        if match:
            x1, y1, x2, y2 = map(int, match.groups())
            if x1 < x2 and y1 < y2:
                return ((x1 + x2) // 2, (y1 + y2) // 2)
    return None


def dismiss_immersive_help():
    snapshot = nodes()
    for label in ("Got it", "知道了", "了解"):
        pos = button_in_snapshot(snapshot, label)
        if pos is not None:
            adb("shell", "input", "tap", str(pos[0]), str(pos[1]))
            print("UI tap: Android system immersive help confirmation", flush=True)
            return True
    return False


def advance_reader_next():
    # One native UI snapshot prevents original Reader chrome (which auto-hides)
    # from disappearing between separate Settings and Next lookups.
    for _ in range(7):
        snapshot = nodes()
        help_button = None
        for label in ("Got it", "知道了", "了解"):
            help_button = button_in_snapshot(snapshot, label)
            if help_button is not None:
                break
        if help_button is not None:
            adb("shell", "input", "tap", str(help_button[0]), str(help_button[1]))
            continue
        settings = next((p for label in ("Settings", "阅读设置", "設定")
                         if (p := button_in_snapshot(snapshot, label))), None)
        next_page = next((p for label in ("Next", "下一页", "次のページ")
                          if (p := button_in_snapshot(snapshot, label))), None)
        if settings is not None and next_page is not None:
            adb("shell", "input", "tap", str(next_page[0]), str(next_page[1]))
            print("UI tap: original Reader Next control (zh/en/ja)", flush=True)
            return
        # Original Reader auto-hides controls and a center tap reveals them.
        adb("shell", "input", "tap", "360", "480")
    raise AssertionError("Original Reader did not expose localized Settings and Next controls")


def reader_flow():
    tap("S3-QA-Comic")
    # A fresh emulator may show Android's immersive-mode education on the FIRST
    # Reader entry, not only after force-stop/relaunch.
    dismiss_immersive_help()
    wait_page_counter("1 / 3", seconds=35)
    dismiss_immersive_help()
    page("05-reader-first-page")
    advance_reader_next()
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



def browse_and_resume_flow(comic):
    global STEP
    STEP = "local-browse-resume"
    # Reuse the actual imported row, long-press menu, shelf ledger and Reader.
    # A shelf tombstone exists from the preceding flow; adding revives membership.
    x, y, _ = wait(("4 pages", "4 页", "4 ページ"), seconds=25)
    adb("shell", "input", "swipe", str(x), str(y), str(x), str(y), "1400")
    tap(("Add to shelf", "加入书架", "本棚に追加"), exact=True)
    tap("QA_Shelf", exact=True)
    shelf = until_data("portable-shelves-v1.json",
        lambda root: any(
            any(item["comicId"] == comic["id"] and not item["deletedAt"]
                for item in row["items"])
            for row in root["shelves"]))
    assert any(item["comicId"] == comic["id"] and not item["deletedAt"]
               for row in shelf["shelves"] for item in row["items"]), shelf
    record("library long press -> original shelf ledger revives tombstoned membership")

    tap(("Continue reading", "继续阅读", "続きを読む"), seconds=25)
    wait_page_counter("2 / 3", seconds=30)
    return_to_library()
    record("library quick continue -> original chapter and saved page after force stop")

    # One actual screen-level read-status case. This is not a substitute for
    # full G1 visual matrix or physical-device testing.
    tap(("All ▾", "全部 ▾", "すべて ▾"), exact=True, only_class="Button")
    tap(("Unread", "未读", "未読"), exact=True)
    wait(("No matching comics", "没有匹配的作品", "一致する作品なし"), seconds=15)
    tap(("Unread ▾", "未读 ▾", "未読 ▾"), exact=True, only_class="Button")
    tap(("All", "全部", "すべて"), exact=True)
    wait(("4 pages", "4 页", "4 ページ"), seconds=20)
    page("09a-library-browse-restored")
    record("actual read-status filter uses original persisted local history")


def import_folder():
    tap(("Import folder", "导入文件夹", "フォルダー取込"))
    page("10-folder-picker")
    locate_document("S3-QA-Folder")
    tap(("Use this folder", "使用此文件夹", "このフォルダを使用"), seconds=18)
    if wait(("Allow", "允许", "許可"), seconds=12, required=False, exact=True, only_class="Button"):
        tap(("Allow", "允许", "許可"), seconds=12, exact=True, only_class="Button")
    tap(("Save to library", "保存到书库", "書庫に保存"), seconds=50)
    wait(("2 pages", "2 页", "2 ページ"), seconds=45)
    found = [x for x in book_rows() if x["kind"] == "folder" and len(x["pages"]) == 2]
    assert found, book_rows()
    page("11-folder-imported")
    record("system SAF folder picker -> original local storage with two valid pages")


def export_cbz():
    global STEP
    STEP = "export-cbz"
    # Target the original four-page list row, not the Continue Reading button
    # which also includes S3-QA-Comic in its accessible label. The previous
    # exact run opened the Reader by long-pressing that button.
    x, y, _ = wait(("4 pages", "4 页", "4 ページ"), seconds=30)
    adb("shell", "input", "swipe", str(x), str(y), str(x), str(y), "1300")
    tap(("Export CBZ", "导出 CBZ", "CBZ に書き出す"), seconds=18, exact=True)
    wait(("Save", "保存", "保存する"), seconds=35, exact=True, only_class="Button")
    page("12-export-system-picker")
    tap(("Save", "保存", "保存する"), seconds=35, exact=True, only_class="Button")
    wait(("CBZ exported", "CBZ 导出完成", "CBZ を書き出しました"), seconds=55)
    page("13-export-complete")
    # Android's system document provider owns the destination; it need not be
    # a shell-visible /sdcard file. Reopen it through the same real SAF picker.
    tap(("Import CBZ", "导入 CBZ", "CBZ 取込"))
    # The picker remembered the containing folder, but its grid lays out
    # the file label below the Android navigation bar. Use its native list
    # mode to make the exact document row genuinely visible and tappable.
    wait("List view", seconds=30, exact=True, only_class="Button")
    tap("List view", exact=True, only_class="Button")
    page("14-export-roundtrip-picker")
    tap("Comic-S3-QA-Comic.cbz", seconds=30, exact=True, only_class="TextView")
    tap(("Save to library", "保存到书库", "書庫に保存"), seconds=65)
    wait(("Comic-S3-QA-Comic",), seconds=45)
    restored = [x for x in book_rows()
                if x["title"] == "Comic-S3-QA-Comic" and len(x["pages"]) == 4]
    assert len(restored) == 1, book_rows()
    expected = ROOT / "fixture" / "S3-QA-Comic.cbz"
    with zipfile.ZipFile(expected, "r") as original:
        names = sorted(original.namelist())
        assert [page["name"] for page in restored[0]["pages"]] == names
        for image in restored[0]["pages"]:
            comic = restored[0]
            path = ("files/local-comics-v1/" + comic["id"].removeprefix("local:") +
                    "/" + comic["generation"] + "/" + image["file"])
            actual = adb("exec-out", "run-as", PACKAGE, "cat", path, binary=True)
            assert actual == original.read(image["name"]), image["name"]
    page("15-export-roundtrip-complete")
    record("system SAF save/reopen -> original CBZ writer/readback; 4 raster bytes identical")



def original_app_flow():
    """R1: the actual v0.5.0-derived Android app, not only the isolated QA shell.

    Use the existing ADB, SAF picker, Reader and fixture helpers; never inspect
    real user profiles, credentials, online sources or change the formal APK.
    """
    global PACKAGE, STEP
    PACKAGE = ORIGINAL_PACKAGE
    STEP = "original-app-first-launch"
    adb("shell", "am", "start", "-W", "-n",
        PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=50)
    wait("使用提示与免责声明", seconds=35)
    # The original disclaimer text is intentionally long and scrollable.
    for _ in range(3):
        if wait("", seconds=2, required=False, only_class="CheckBox"):
            break
        adb("shell", "input", "swipe", "360", "1020", "360", "300", "480")
    checkbox = wait("", seconds=12, only_class="CheckBox")
    adb("shell", "input", "tap", str(checkbox[0]), str(checkbox[1]))
    # Android 35 edge-to-edge may expose the consent button next to the
    # system gesture bar. A raw tap at y≈1220/1280 returns to the launcher;
    # scroll the real disclaimer so its button is safely inside app content.
    confirm = wait("同意并继续", seconds=12, exact=True, only_class="Button")
    if confirm[1] >= 1100:
        adb("shell", "input", "swipe", "360", "1030", "360", "380", "480")
        confirm = wait("同意并继续", seconds=12, exact=True, only_class="Button")
    if confirm[1] >= 1100:
        raise AssertionError("Consent button remains obstructed by system navigation")
    adb("shell", "input", "tap", str(confirm[0]), str(confirm[1]))
    print(f"UI tap: original app consent at safe ({confirm[0]},{confirm[1]})", flush=True)
    # First-run guide can be dismissed without disabling it in production.
    prompt = wait(("Later", "稍后"), seconds=8, required=False, only_class="Button")
    if prompt:
        adb("shell", "input", "tap", str(prompt[0]), str(prompt[1]))
    wait(("我的书库", "My library"), seconds=40)
    page("16-original-home")
    record("original provider-enabled app starts its Home/Library with no source login")

    STEP = "original-app-import"
    tap(("Import local comics", "导入本地漫画", "ローカル漫画を取り込む"),
        seconds=28, only_class="Button")
    tap(("Choose CBZ/ZIP comic", "选择 CBZ", "CBZ を選択"),
        seconds=25, only_class="Button")
    locate_document("S3-QA-Comic.cbz")
    tap(("Confirm import / update copy", "确认导入", "取り込む"),
        seconds=45, only_class="Button")
    wait(("Read offline", "离线阅读", "オフラインで読む"), seconds=60)
    comic = book_rows()
    assert len(comic) == 1 and len(comic[0]["pages"]) == 4, comic
    page("17-original-imported")
    record("original app SAF -> original Import page -> four-page local manifest")

    STEP = "original-app-read"
    tap(("Read offline", "离线阅读", "オフラインで読む"),
        seconds=25, exact=True, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("1 / 3", seconds=40)
    advance_reader_next()
    wait_page_counter("2 / 3", seconds=40)
    time.sleep(1.2)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    until_data("reading-history-v1.json",lambda data:
        any(s.get("sourceKind") == "local" and s.get("lastPage", 0) >= 1
            for s in data.get("sessions", [])))
    page("18-original-reader-progress")
    record("original Reader persists local chapter and second-page progress")

    STEP = "original-app-home-resume"
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    # Returning to Home reloads the original local-history projection.
    tap(("Continue local reading", "继续本地阅读", "ローカル読書を再開"),
        seconds=50, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("2 / 3", seconds=40)
    page("19-original-home-resume")
    record("original Home local Continue launches same Reader at saved chapter/page")

    STEP = "original-app-restart"
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=45)
    # Consent is persisted, but "Later" on the original first-use tour is
    # deliberately session-only. After force-stop, close that real dialog
    # rather than hiding it with test data edits or pretending it did not recur.
    tour = wait(("稍后再看", "Later", "後で"), seconds=10,
                required=False, only_class="Button")
    if tour:
        adb("shell", "input", "tap", str(tour[0]), str(tour[1]))
        print("UI tap: original onboarding Later after force stop", flush=True)
    tap(("Continue local reading", "继续本地阅读", "ローカル読書を再開"),
        seconds=50, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("2 / 3", seconds=40)
    page("20-original-restart-resume")
    record("force-stop/relaunch original Home retains local book and saved page")
    if ORIGINAL_PACKAGE == CLEAN_PACKAGE:
        # The physically clean original full app has no legacy HostSourceActivity
        # or bundled provider menu. Its standalone Host path is exercised below.
        record("clean original four-tab app imports, reads and resumes local CBZ")
        return

    # Exercise the ORIGINAL app’s new, source-neutral Host entry.
    # Navigating there must not depend on a provider account or start a Host.
    STEP = "original-app-external-host-entry"
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap(("在线", "Online", "オンライン"), seconds=25, exact=True,
        only_class="Button")
    tap(("我的外接来源", "My external sources", "外部ソース"),
        seconds=25)
    wait(("我的外部 Host", "My external Host", "自分の外部 Host"), seconds=25)
    page("21-original-user-host-entry")
    record("original Android Online tab opens user-owned Host config without provider login")

def source_free_user_host_flow():
    """Drive separate real Host-capable APK; no actual source or account installed."""
    global PACKAGE, STEP
    # From the offline Reader, open the installed *source-only* component.
    # There is no second library, reader or local files in that package.
    PACKAGE = QA_PACKAGE
    STEP = "source-free-reader-opens-source-companion"
    adb("shell", "am", "start", "-W", "-n",
        PACKAGE + "/com.picalibrary.android.LocalLibraryActivity",timeout=45)
    wait(("Import CBZ", "导入 CBZ", "CBZ 取込"),seconds=25)
    tap(("My external Host", "我的外接来源", "外部 Host"),
        seconds=25, only_class="Button")
    # The source-free Reader now owns discovery and lifecycle navigation.
    # Explicit opt-in stays separate from Android system uninstall/settings.
    tap(("Open source settings", "打开来源设置", "ソース設定を開く"),
        seconds=25)
    PACKAGE=USER_HOST_PACKAGE
    wait(("My external sources","我的外部来源","外部ソース"),seconds=30)
    wait(("No Host connected","尚未连接 Host","未接続"),seconds=25)
    page("22-only-external-source-companion")
    record("offline Reader opens independent source-only Host component without auto-connect")

    with synthetic_user_host() as (port, operations, pngs):
        STEP = "user-host-real-http-config"
        type_into_host(("Host name","连接名称","接続名"),"QA_Host")
        type_into_host(("Host URL","Host URL (http:// 或 https://)"),
                       f"http://127.0.0.1:{port}/")
        tap_scrolling(("Save configuration","保存配置","設定を保存"),
                      only_class="Button")
        until_data("user-host-config-v1.json",lambda data:
            data.get("endpoint")==f"http://127.0.0.1:{port}/" and
            data.get("enabled") is False)
        # Consent is an explicit checkbox; neither save nor enable connects.
        tap_scrolling(("Authorize this Host session","我授权本次连接自己的 Host",
                       "この接続を許可します"),only_class="CheckBox")
        tap_scrolling(("Enable / disable Host","启用 / 停用 Host","Host 有効／無効"),
                      only_class="Button")
        until_data("user-host-config-v1.json",lambda data: data.get("enabled") is True)
        assert not operations, f"Host connected implicitly: {operations}"
        page("24-host-saved-without-network")
        record("user-selected loopback Host configured/enabled with no automatic request")

        STEP = "user-host-real-http-source-search"
        tap_scrolling(("Connect and list sources","连接并读取来源","接続してソースを表示"),
                      only_class="Button")
        wait_host_operation(operations,"PicaSourceHostSources")
        tap_scrolling(("Next sources","下一页来源","次のソース"),only_class="Button")
        wait(("Installed sources 26", "已安装来源 26", "導入済みソース 26"),
             seconds=30)
        assert operations.count("PicaSourceHostSources")>=2, (
            "Host did not request second installed-source page")
        tap_scrolling(("Prev sources","上一页来源","前のソース"),only_class="Button")
        wait(("Installed sources 1", "已安装来源 1", "導入済みソース 1"),
             seconds=30)
        tap_scrolling(("Next sources","下一页来源","次のソース"),only_class="Button")
        wait(("Installed sources 26", "已安装来源 26", "導入済みソース 26"),
             seconds=30)
        record("Android signed Host can browse a 26-source catalogue and select from page 2")
        tap_scrolling(("Use selected source","选择此来源","ソースを選択"),
                      only_class="Button")
        type_into_host(("Search works","搜索作品","作品を検索"),"synthetic")
        tap_scrolling(("Search selected source","搜索选中来源","選択ソースで検索"),
                      only_class="Button")
        wait_host_operation(operations,"PicaHostSourceSearch")
        wait(("Search page 1","搜索第 1 页","検索 1 ページ"),seconds=30)
        tap_scrolling(("Next results","下一批结果","次の検索結果"),
                      only_class="Button")
        wait(("Search page 2","搜索第 2 页","検索 2 ページ"),seconds=30)
        tap_scrolling(("Previous results","上一批结果","前の検索結果"),
                      only_class="Button")
        wait(("Search page 1","搜索第 1 页","検索 1 ページ"),seconds=30)
        tap_scrolling(("Next results","下一批结果","次の検索結果"),
                      only_class="Button")
        wait(("Search page 2","搜索第 2 页","検索 2 ページ"),seconds=30)
        assert operations.count("PicaHostSourceSearch")>=4, (
            "Host did not request search pages 1→2→1→2")
        record("Android Host browses multiple search pages and chooses a page-2 work")
        STEP = "user-host-bookmark-save-and-original-reader-resume"
        tap_scrolling(("Save online bookmark (no download)",
                       "保存在线书签（不下载）","オンラインブックマークを保存"),
                      direction="down",only_class="Button")
        until_data("user-host-saved-books-v1.json",lambda data:
            len(data.get("books",[]))==1 and
            data["books"][0].get("title")=="S3-QA-Hosted-Comic")
        # The SOURCE-FREE original local library now exposes the saved book
        # through its existing opt-in source action, without a Host request.
        STEP = "source-free-library-to-saved-host-bookmark"
        operations_before_shortcut=len(operations)
        # Use the actual, now always-visible Host navigation rather than an
        # adb activity launch that leaves an unrelated foreground Host screen.
        tap(("Back to Reader","返回阅读器","Reader に戻る"),
            seconds=25,exact=True,only_class="Button")
        PACKAGE=QA_PACKAGE
        wait(("Import CBZ","导入 CBZ","CBZ 取込"),seconds=30)
        tap(("我的外接来源 · 已安装","My external Host · installed",
             "外部 Host · インストール済み"),seconds=30,only_class="Button")
        tap(("查看我的在线书签","View saved online works",
             "保存済みの作品を見る"),seconds=25)
        PACKAGE=USER_HOST_PACKAGE
        wait(("Online bookmarks 1","在线书签 1",
              "オンラインブックマーク 1"),seconds=35)
        assert len(operations)==operations_before_shortcut, (
            "Opening saved books from the original local Library contacted Host")
        page("24a-original-library-opens-saved-online-books-offline")
        record("source-free Library -> signed source-only saved bookmarks without Host network")
        tap_scrolling(("Resume online (find saved source)",
                       "继续在线阅读（自动定位原来源）","オンライン読書を再開（ソースを探す）"),
                      direction="down",only_class="Button")
        wait_page_counter("1 / 2",seconds=45)
        record("persistent source-only bookmark opens existing original Reader without repeating search")
        # The Host app must open the separately installed no-INTERNET Reader,
        # not silently fall back to the Host companion Reader.
        active=adb("shell","dumpsys","activity","activities",timeout=35)
        if ("com.picalibrary.android.ExternalReaderActivity" not in active or
                "com.picalibrary.android.localcore.qa" not in active):
            raise AssertionError("Signed Binder Reader did not become visible")
        page("25-original-reader-from-synthetic-host")
        advance_reader_next()
        wait_page_counter("2 / 2",seconds=35)
        page("26-original-reader-host-second-image")
        record("real local HTTP Suwayomi: same-signer Binder source -> separate original no-network Reader -> second PNG")
        current_package=PACKAGE
        try:
            PACKAGE=QA_PACKAGE
            until_data("reading-history-v1.json",lambda data: any(
                row.get("sourceKind")=="host" and row.get("lastPage",0)>=1
                for row in data.get("sessions",[])),seconds=25)
        finally:
            PACKAGE=current_package
        record("external source progress persists in original source-free Reader profile")

        STEP = "user-host-binder-import-to-original-library"
        adb("shell","input","keyevent","KEYCODE_BACK")
        # After returning from the saved-bookmark Reader, the previous
        # search results are no longer visible. Import must remain actionable
        # from this persisted bookmark without repeating a source search.
        # No Host-side local inventory: explicit chapter confirmation still
        # belongs to the original signed Reader import UI.
        searches_before_import=operations.count("PicaHostSourceSearch")
        tap_scrolling(("Save bookmarked chapter to Reader library",
                       "从书签保存章节到阅读器书库",
                       "ブックマークの章を Reader 書庫に保存"),
                      direction="down",only_class="Button")
        assert operations.count("PicaHostSourceSearch")==searches_before_import, (
            "Importing a saved bookmark unexpectedly repeated a source search")
        wait(("Save to original Reader","保存到原阅读器书库","元の Reader に保存"),
             seconds=35)
        tap(("Choose chapter to save","选择要保存的章节","保存する章を選択"),
            only_class="Button",seconds=25)
        tap(("Synthetic chapter",),seconds=30)
        tap(("Save this chapter","保存这一章","この章を保存"),
            exact=True,only_class="Button",seconds=20)
        originalPackage=PACKAGE
        try:
            PACKAGE=QA_PACKAGE
            importedToReader=None
            end=time.monotonic()+65
            while time.monotonic()<end:
                importedToReader=next((row for row in book_rows() if
                    row["title"].startswith("S3-QA-Hosted-Comic") and
                    len(row["pages"])==2),None)
                if importedToReader:break
                time.sleep(.6)
            assert importedToReader,("Signed Binder import never entered the "
                "original source-free library")
            idFromReader=importedToReader["id"]
            localRaster=("files/local-comics-v1/"+idFromReader.removeprefix("local:")
                         +"/"+importedToReader["generation"]+"/"
                         +importedToReader["pages"][0]["file"])
            assert adb("exec-out","run-as",PACKAGE,"cat",localRaster,
                       binary=True)==pngs[0], "Binder page copied wrong image bytes"
        finally:
            PACKAGE=originalPackage
        page("27a-cross-app-binder-import-in-original-library")
        record("signed remote Host chapter imported into original source-free library with matching PNG bytes")
        adb("shell","input","keyevent","KEYCODE_BACK")
        # The original Host Browser retains its scroll position after an
        # external chapter import. Its header is intentionally off-screen;
        # require the actionable session controls rather than a hidden title.
        wait(("Disconnect","断开会话","セッション終了"),
             seconds=25,only_class="Button")

        tap_scrolling(("Disconnect","断开会话","セッション終了"),
                      direction="up",only_class="Button")
        # The Host component owns no local inventory; Back returns to the
        # one no-INTERNET Reader, whose original Library keeps the saved copy.
        # The Host back control is fixed above the ScrollView (y~96 on
        # Android35), outside the scroll helper's >=100 coordinate rule.
        tap(("Back to Reader","返回阅读器","Reader に戻る"),
            exact=True,only_class="Button",seconds=25)
        wait(("Import CBZ","导入 CBZ","CBZ 取込"),seconds=25)

        # Verify original Reader retains the Binder-imported chapter even
        # after its source component was explicitly disconnected.
        STEP = "source-free-original-library-offline-after-revoke"
        PACKAGE=QA_PACKAGE
        adb("shell","am","start","-W","-n",
            PACKAGE+"/com.picalibrary.android.LocalLibraryActivity",timeout=45)
        wait(("Import CBZ","导入 CBZ","CBZ 取込"),seconds=25)
        tap_scrolling("S3-QA-Hosted-Comic",direction="down")
        dismiss_immersive_help()
        wait_page_counter("1 / 2",seconds=40)
        page("29-original-source-free-library-after-host-revoke")
        record("source-free Reader opens its own Binder-imported chapter with Host disconnected")

        # Upgrade the optional source to a DIFFERENT debug APK, versionCode 1
        # -> 2, without replacing the Reader, granting network to the Reader,
        # or writing its private library. Both versions use the same QA signer.
        STEP = "source-only-companion-versioned-upgrade"
        host_apk = "mobile/android-alpha2/s3-host-qa-apks/user-host-v2.apk"
        assert installed_version_code(USER_HOST_PACKAGE)==1
        operations_before_upgrade=len(operations)
        adb("install", "-r", host_apk, timeout=65)
        assert installed_version_code(USER_HOST_PACKAGE)==2
        PACKAGE=USER_HOST_PACKAGE
        until_data("user-host-config-v1.json", lambda data:
            data.get("label")=="QA_Host" and data.get("enabled") is True)
        until_data("user-host-saved-books-v1.json",lambda data:
            len(data.get("books",[]))==1 and
            data["books"][0].get("title")=="S3-QA-Hosted-Comic")
        assert len(operations)==operations_before_upgrade, (
            "Source update triggered a Host request without user action")
        record("different versionCode QA source APK upgrades in place and retains consent/config without auto-connecting")

        # Exercise the real user return path on a NEW Host process/version.
        # Merely checking the JSON after install does not prove bookmarked works
        # remain actionable without repeating a source search.
        STEP = "saved-online-bookmark-resume-after-source-v2-upgrade"
        PACKAGE = QA_PACKAGE
        adb("shell","input","keyevent","KEYCODE_BACK")
        wait(("Import CBZ", "导入 CBZ", "CBZ 取込"),seconds=30)
        tap(("My external Host","我的外接来源","外部 Host"),
            seconds=25,only_class="Button")
        tap(("Open source settings","打开来源设置","ソース設定を開く"),
            seconds=25)
        PACKAGE = USER_HOST_PACKAGE
        wait(("My external sources","我的外部来源","外部ソース"),seconds=30)
        wait(("No Host connected","尚未连接 Host","未接続"),seconds=30)
        tap_scrolling(("Saved online works","已保存的在线作品",
                       "保存済みオンライン作品"),direction="down",only_class="Button")
        wait(("Online bookmarks 1","在线书签 1",
              "オンラインブックマーク 1"),seconds=30)
        record("saved online metadata is visible on a newly launched upgraded Host with no session")
        tap_scrolling(("Connect to resume bookmarks","连接 Host 以继续书签",
                       "Host に接続して再開"),direction="down",only_class="Button")
        tap_scrolling(("Authorize this Host session","我授权本次连接自己的 Host",
                       "この接続を許可します"),direction="down",only_class="CheckBox")
        tap_scrolling(("Connect and list sources","连接并读取来源",
                       "接続してソースを表示"),direction="down",only_class="Button")
        wait(("Online bookmarks 1","在线书签 1",
              "オンラインブックマーク 1"),seconds=40)
        # This is an explicit bookmark action. The existing manager locates
        # the saved source through its standard bounded 25-row listing, so
        # the user does not manually traverse the source picker after upgrade.
        source_queries=operations.count("PicaSourceHostSources")
        searches=operations.count("PicaHostSourceSearch")
        tap_scrolling(("Resume online (find saved source)",
                       "继续在线阅读（自动定位原来源）","オンライン読書を再開（ソースを探す）"),
                      direction="up",only_class="Button")
        wait_page_counter("2 / 2",seconds=50)
        assert operations.count("PicaSourceHostSources")>=source_queries+2, (
            "Saved-source resume did not locate the page-2 installed extension")
        assert operations.count("PicaHostSourceSearch")==searches, (
            "Saved-source resume unexpectedly repeated manga search")
        page("29a-bookmark-resume-after-v2-host-restart")
        record("versioned Host install preserves source-only bookmark and original Reader page-2 resume")
        adb("shell","input","keyevent","KEYCODE_BACK")
        # Switching source is an explicit session revocation, not a silent
        # reuse of live credentials or a hidden source change in the Reader.
        STEP="signed-host-user-changes-source"
        tap_scrolling(("Change source (end session)","更换来源（结束当前会话）",
                       "ソース変更（接続を終了）"),direction="down",only_class="Button")
        tap(("End and change","结束并更换","終了して変更"),
            exact=True,only_class="Button",seconds=25)
        wait(("Session ended. Authorize and reconnect to choose a source.",
              "已结束当前会话，请重新授权后选择来源。",
              "接続を終了しました。再認証してソースを選択してください。"),seconds=25)
        wait(("Connect and list sources","连接并读取来源",
              "接続してソースを表示"),seconds=25)
        record("explicit source switch revokes old Host session while retaining saved online and offline work")
        # The Host back control is fixed above the ScrollView (y~96 on
        # Android35), outside the scroll helper's >=100 coordinate rule.
        tap(("Back to Reader","返回阅读器","Reader に戻る"),
            exact=True,only_class="Button",seconds=25)
        PACKAGE = QA_PACKAGE
        wait(("Import CBZ", "导入 CBZ", "CBZ 取込"),seconds=30)
        # Explicitly approved re-connect and saved-source discovery above
        # legitimately issued additional GraphQL calls after the v1→v2
        # upgrade. Snapshot only after the user has revoked that session.
        operations_before_reinstall=len(operations)

        # Remove ONLY the source APK. The local Reader must still expose the
        # actual already imported PNG and open it without source installation.
        STEP = "source-only-uninstall-preserves-original-reader"
        adb("uninstall", USER_HOST_PACKAGE, timeout=55)
        PACKAGE=QA_PACKAGE
        assert USER_HOST_PACKAGE not in adb("shell", "pm", "list", "packages",
                                            USER_HOST_PACKAGE)
        # Package removal can invalidate an active Binder connection and
        # transient Android windows. Prove a clean process-level Reader restart
        # rather than accepting a stale activity or an empty UI hierarchy.
        adb("shell", "am", "force-stop", QA_PACKAGE)
        adb("shell", "am", "start", "-W", "-n",
            PACKAGE+"/com.picalibrary.android.LocalLibraryActivity",timeout=45)
        page("30-source-removed-fresh-reader-launch")
        wait(("Import CBZ", "导入 CBZ", "CBZ 取込"),seconds=30)
        wait(("External sources · not installed", "外接来源 · 未安装",
              "外部ソース · 未インストール"),seconds=30)
        assert adb("exec-out", "run-as", PACKAGE, "cat", localRaster,
                   binary=True)==pngs[0], "Source removal changed the imported page"
        page("30-reader-source-component-uninstalled")
        tap_scrolling("S3-QA-Hosted-Comic",direction="down")
        dismiss_immersive_help()
        wait_page_counter("1 / 2",seconds=40)
        page("31-offline-book-still-readable-with-host-uninstalled")
        record("source companion uninstall preserves the Reader's exact PNG, comic, and offline reading")

        # Reinstalling the optional component must not auto-connect or require
        # Reader migration; Host settings are deliberately reset by uninstall.
        STEP = "source-only-reinstall-after-uninstall"
        adb("install", "-r", host_apk, timeout=65)
        assert installed_version_code(USER_HOST_PACKAGE)==2
        adb("shell", "am", "force-stop", QA_PACKAGE)
        adb("shell", "am", "start", "-W", "-n",
            QA_PACKAGE+"/com.picalibrary.android.LocalLibraryActivity",timeout=45)
        wait(("My external Host", "我的外接来源", "外部 Host"),seconds=30)
        tap(("My external Host", "我的外接来源", "外部 Host"),
            seconds=25,only_class="Button")
        tap(("Open source settings", "打开来源设置", "ソース設定を開く"),seconds=25)
        PACKAGE=USER_HOST_PACKAGE
        wait(("No Host connected", "尚未连接 Host", "未接続"),seconds=30)
        page("32-source-component-reinstalled-no-auto-connect")
        assert len(operations)==operations_before_reinstall, (
            "Source uninstall/reinstall triggered a Host request after revocation")
        record("optional v2 source reinstall restores same-signer management without implicit network connection")
        PACKAGE=USER_HOST_PACKAGE
        assert all(item in operations for item in ("PicaSourceHostInfo",
            "PicaSourceHostSources","PicaHostSourceSearch","PicaHostManga",
            "PicaHostChapter","PicaHostChapterPages","PicaHostPrepareManga")),operations
        (ROOT/"synthetic-host-operations.json").write_text(json.dumps(
            {"operations":operations,"syntheticOnly":True},indent=2),
            encoding="utf-8")

@contextmanager
def pinned_official_suwayomi_local_source():
    """The ACTUAL pinned upstream JAR, with only its built-in local fixture.

    Reuse source-host-interop-fixture.mjs for official supported JVM options;
    no bundled Host, plugin SDK, account, private data or second Reader.
    """
    global STEP
    if (os.environ.get("GITHUB_ACTIONS") != "true" or
            os.environ.get("GITHUB_REPOSITORY") != "Saber-Alter-Lily/pica-library" or
            os.environ.get("GITHUB_REF") !=
            "refs/heads/codex/product-integration-r1-20261102"):
        raise AssertionError("Official Host Android runtime is CI integration branch only")
    jar = Path(os.environ["PICA_R2_REAL_HOST_JAR"]).resolve(strict=True)
    if jar.stat().st_size != 182952426:
        raise AssertionError("Unpinned Suwayomi binary size")
    digest = hashlib.sha256()
    with jar.open("rb") as image:
        for piece in iter(lambda: image.read(1024 * 1024), b""):
            digest.update(piece)
    if digest.hexdigest() != "af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd":
        raise AssertionError("Unpinned Suwayomi binary digest")
    java_home = Path(os.environ["JAVA_HOME_21_X64"]).resolve(strict=True)
    java = java_home / "bin" / "java"
    if not java.is_file():
        raise AssertionError("Pinned upstream runtime requires JDK 21")
    with tempfile.TemporaryDirectory(
            prefix="pica-r2-official-host-",
            dir=os.environ["RUNNER_TEMP"]) as temp_root:
        root = Path(temp_root)
        for directory in ("home", "java-tmp", "host/local/Interop Fixture CBZ"):
            (root / directory).mkdir(parents=True)
        images = (original_png(60, 80, 175), original_png(160, 130, 45))
        with zipfile.ZipFile(root / "host/local/Interop Fixture CBZ/Chapter 1.cbz",
                             "w", zipfile.ZIP_DEFLATED) as archive:
            for index, contents in enumerate(images, 1):
                archive.writestr(f"{index}.png", contents)
        # This is the EXACT pre-existing official-host JVM-options helper.
        command = ("import {realHostJavaArguments} "
                   "from './scripts/lib/source-host-interop-fixture.mjs'; "
                   "console.log(JSON.stringify(realHostJavaArguments("
                   "process.argv[1],process.argv[2])))")
        args = json.loads(run("node", "--input-type=module", "-e", command,
                              str(root), str(jar)))
        host_log = root / "host-startup.log"
        java_env = {"PATH": str(java_home / "bin") + ":/usr/bin:/bin",
                    "HOME": str(root / "home"),
                    "TMPDIR": str(root / "java-tmp"),
                    "LANG": "C.UTF-8", "JAVA_HOME": str(java_home)}
        with host_log.open("wb") as output:
            process = subprocess.Popen([str(java)] + args, cwd=str(root),
                                       stdin=subprocess.DEVNULL,
                                       stdout=output, stderr=subprocess.STDOUT,
                                       env=java_env)
            try:
                info = {"operationName": "PicaSourceHostInfo",
                        "query": "query PicaSourceHostInfo { aboutServer { name version } }",
                        "variables": {}}
                sources = {"operationName": "PicaSourceHostSources",
                           "query": ("query PicaSourceHostSources($first: Int!, $offset: Int!) "
                                     "{ sources(first: $first, offset: $offset) { "
                                     "nodes { id name lang supportsLatest } "
                                     "pageInfo { hasNextPage hasPreviousPage } totalCount } }"),
                           "variables": {"first": 25, "offset": 0}}
                def graphql(query):
                    data = json.dumps(query).encode("utf-8")
                    request = urllib.request.Request(
                        "http://127.0.0.1:4567/api/graphql", data=data,
                        headers={"content-type": "application/json"})
                    with urllib.request.urlopen(request, timeout=2) as reply:
                        return json.loads(reply.read(20000).decode("utf-8"))["data"]
                ready = False
                for _ in range(180):
                    if process.poll() is not None:
                        break
                    try:
                        about = graphql(info)["aboutServer"]
                        if about["version"].lstrip("v") == "2.4.2366":
                            records = graphql(sources)["sources"]["nodes"]
                            if len(records) == 1 and records[0]["id"] == "0":
                                ready = True
                                break
                    except (OSError, ValueError, KeyError, TimeoutError):
                        pass
                    time.sleep(.5)
                if not ready:
                    print("Pinned Host startup last lines: " +
                          host_log.read_text(errors="replace")[-3500:],
                          file=sys.stderr, flush=True)
                    raise AssertionError("OFFICIAL_SUWAYOMI_LOCAL_SOURCE_NOT_READY")
                adb("reverse", "tcp:4567", "tcp:4567")
                yield images
            finally:
                adb("reverse", "--remove", "tcp:4567", check=False)
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=8)



def original_full_product_signed_host_flow(upstream_pages):
    """REAL original four-tab app -> separately installed Host -> its own Reader/local store."""
    global PACKAGE, STEP
    STEP = "r3-original-product-signed-source-entry"
    adb("shell", "am", "force-stop", ORIGINAL_PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        ORIGINAL_PACKAGE + "/com.picalibrary.android.DisclaimerActivity",
        timeout=48)
    PACKAGE = ORIGINAL_PACKAGE
    later = wait(("稍后再看", "Later", "後で"), seconds=8,
                 required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=40)
    tap(("在线", "Online", "オンライン"), seconds=22,
        exact=True, only_class="Button")
    if ORIGINAL_PACKAGE == CLEAN_PACKAGE:
        tap(("我的外接来源", "My external sources", "外部ソース"), seconds=25)
    else:
        tap(("独立来源组件 · 工程候选", "Independent source component · QA",
             "独立した外部ソース · QA"), seconds=25)
    PACKAGE = USER_HOST_PACKAGE
    wait(("No Host connected", "尚未连接 Host", "未接続"), seconds=30)
    page("37-original-product-opens-independent-source")
    record("original four-tab Android product opens same-signer independent Host without auto-connect")

    STEP = "r3-original-product-host-real-upstream"
    tap_scrolling(("Authorize this Host session",
                   "我授权本次连接自己的 Host", "この接続を許可します"),
                  only_class="CheckBox")
    tap_scrolling(("Connect and list sources", "连接并读取来源",
                   "接続してソースを表示"), only_class="Button")
    tap_scrolling(("Use selected source", "选择此来源",
                   "ソースを選択"), only_class="Button")
    type_into_host(("Search works", "搜索作品", "作品を検索"), "CBZ")
    tap_scrolling(("Search selected source", "搜索选中来源",
                   "選択ソースで検索"), only_class="Button")
    tap_scrolling(("Save online bookmark (no download)",
                   "保存在线书签（不下载）","オンラインブックマークを保存"),
                  direction="down",only_class="Button")
    until_data("user-host-saved-books-v1.json",lambda data:
        any(row.get("title")=="Interop Fixture CBZ"
            for row in data.get("books",[])),seconds=35)
    tap_scrolling("Read · Interop Fixture CBZ",
                  direction="down", only_class="Button")
    wait_page_counter("1 / 2", seconds=45)
    active = adb("shell", "dumpsys", "activity", "activities", timeout=35)
    assert ("com.picalibrary.android.ExternalReaderActivity" in active and
            ORIGINAL_PACKAGE in active), (
        "Source-only Host did not open the ORIGINAL full product Reader")
    advance_reader_next()
    wait_page_counter("2 / 2", seconds=40)
    page("38-original-product-binder-reader-page-2")
    record("official Suwayomi -> signed Host -> full original Android product Reader page 2")

    STEP = "r3-original-product-authorized-import"
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap_scrolling(("Save to Reader library", "保存到阅读器书库",
                   "Reader 書庫に保存"), direction="down", only_class="Button")
    wait(("Save to original Reader", "保存到原阅读器书库",
          "元の Reader に保存"), seconds=35)
    tap(("Choose chapter to save", "选择要保存的章节",
         "保存する章を選択"), seconds=30, only_class="Button")
    tap(("Chapter 1",), seconds=35)
    tap(("Save this chapter", "保存这一章", "この章を保存"),
        exact=True, only_class="Button", seconds=20)
    PACKAGE = ORIGINAL_PACKAGE
    imported = None
    deadline = time.monotonic() + 80
    while time.monotonic() < deadline:
        imported = next((row for row in book_rows() if
                         row["title"].startswith("Interop Fixture CBZ") and
                         len(row["pages"]) == 2), None)
        if imported is not None:
            break
        time.sleep(.7)
    assert imported is not None, (
        "Signed source never copied into the original product's private LocalComicStore")
    first = "files/local-comics-v1/" + imported["id"].removeprefix("local:") + (
        "/" + imported["generation"] + "/")
    for i, pg in enumerate(imported["pages"]):
        actual = adb("exec-out", "run-as", ORIGINAL_PACKAGE,
                     "cat", first + pg["file"], binary=True)
        assert actual == upstream_pages[i], "Original app imported wrong upstream PNG bytes"
    page("39-original-product-signed-import-owns-pages")
    record("source-only Host copied upstream two-page chapter into ORIGINAL product library byte-for-byte")

    STEP = "r3-original-product-original-reader"
    tap(("Read saved local copy", "阅读已保存的本地副本",
         "保存済みの作品を読む"), seconds=35, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("1 / 2", seconds=45)
    active = adb("shell", "dumpsys", "activity", "activities", timeout=35)
    assert ("com.picalibrary.android.ReaderActivity" in active and
            ORIGINAL_PACKAGE in active), (
        "Imported local copy did not open the actual full-product ReaderActivity")
    page("40-original-product-real-reader-offline-copy")
    record("full original Android ReaderActivity reads identical source-imported local chapter")

    STEP = "r3-original-product-source-disconnect"
    # Leave the original Reader once, then use the existing import screen's
    # actual Back button. A blind second Android BACK may only dismiss reader
    # controls or leave ExternalImportActivity visible under the Host window.
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    if wait(("Save to original Reader", "保存到原阅读器书库",
             "元の Reader に保存"), seconds=12, required=False):
        tap(("Back", "返回", "戻る"), exact=True, only_class="Button",
            seconds=20)
    PACKAGE = USER_HOST_PACKAGE
    # Prove we are back on the Host management screen before revoking its
    # session. Never claim disconnection while the import UI still covers it.
    tap_scrolling(("Disconnect", "断开会话",
                   "セッション終了"), direction="up", only_class="Button")
    adb("shell", "am", "force-stop", USER_HOST_PACKAGE)
    adb("shell", "am", "force-stop", ORIGINAL_PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        ORIGINAL_PACKAGE + "/com.picalibrary.android.DisclaimerActivity",
        timeout=45)
    PACKAGE = ORIGINAL_PACKAGE
    later = wait(("稍后再看", "Later", "後で"), seconds=8,
                 required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=40)
    wait("Interop Fixture CBZ", seconds=50)
    page("41-original-product-library-after-host-stopped")
    if ORIGINAL_PACKAGE == CLEAN_PACKAGE:
        STEP = "r3-original-clean-home-opens-saved-host-books-offline"
        tap(("已保存的在线作品","Saved online works",
             "保存済みオンライン作品"),seconds=30,only_class="Button")
        PACKAGE=USER_HOST_PACKAGE
        wait(("需要先授权连接原 Host。","First authorize the original Host.",
              "まず元の Host への接続を許可してください。"),seconds=35)
        wait(("Interop Fixture CBZ",),seconds=35)
        page("41a-clean-original-home-saved-host-bookmark")
        record("original clean four-tab Home opens retained Host bookmark without auto-connect")
        tap(("返回阅读器","Back to Reader","Reader に戻る"),
            seconds=25,only_class="Button")
        PACKAGE=ORIGINAL_PACKAGE
        wait(("我的书库","My library","マイライブラリ"),seconds=35)
    tap("Interop Fixture CBZ", seconds=25)
    tap(("阅读", "Read", "読む"), seconds=55, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("1 / 2", seconds=40)
    page("42-original-product-owned-offline-reader")
    record("Host stopped, original four-tab Home still browses saved chapter via its own Reader")


def official_upstream_android_reader_flow():
    """Official runtime -> owned Host APK -> existing Reader -> local offline PNG."""
    global PACKAGE, STEP
    STEP = "r2-official-upstream-local-source"
    with pinned_official_suwayomi_local_source() as original_pages:
        PACKAGE = USER_HOST_PACKAGE
        wait(("No Host connected", "尚未连接 Host", "未接続"), seconds=25)
        # Previous scenario has uninstalled and reinstalled the Host-only APK.
        # Its Android data were reset: no prior connection or implicit log-in.
        type_into_host(("Host name", "连接名称", "接続名"), "Upstream_Local")
        type_into_host(("Host URL", "Host URL (http:// 或 https://)"),
                       "http://127.0.0.1:4567/")
        tap_scrolling(("Save configuration", "保存配置", "設定を保存"),
                      only_class="Button")
        until_data("user-host-config-v1.json", lambda data:
            data.get("endpoint") == "http://127.0.0.1:4567/" and
            data.get("enabled") is False)
        tap_scrolling(("Authorize this Host session",
                       "我授权本次连接自己的 Host", "この接続を許可します"),
                      only_class="CheckBox")
        tap_scrolling(("Enable / disable Host", "启用 / 停用 Host",
                       "Host 有効／無効"), only_class="Button")
        until_data("user-host-config-v1.json",
                   lambda data: data.get("enabled") is True)
        STEP = "r2-official-upstream-source-discovery"
        tap_scrolling(("Connect and list sources", "连接并读取来源",
                       "接続してソースを表示"), only_class="Button")
        tap_scrolling(("Use selected source", "选择此来源",
                       "ソースを選択"), only_class="Button")
        type_into_host(("Search works", "搜索作品", "作品を検索"), "CBZ")
        tap_scrolling(("Search selected source", "搜索选中来源",
                       "選択ソースで検索"), only_class="Button")
        tap_scrolling("Read · Interop Fixture CBZ",
                      direction="down", only_class="Button")
        wait_page_counter("1 / 2", seconds=50)
        active = adb("shell", "dumpsys", "activity", "activities", timeout=35)
        assert ("com.picalibrary.android.ExternalReaderActivity" in active and
                QA_PACKAGE in active), "Official Host bypassed the original Reader"
        page("33-official-upstream-real-host-reader")
        advance_reader_next()
        wait_page_counter("2 / 2", seconds=40)
        page("34-official-upstream-real-host-next-page")
        record("official Suwayomi v2.4.2366 built-in local source -> Android signed Binder -> original Reader page 2")

        STEP = "r2-official-upstream-optional-chapter-import"
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        tap_scrolling(("Save to Reader library",
                       "保存到阅读器书库", "Reader 書庫に保存"),
                      direction="down", only_class="Button")
        wait(("Save to original Reader", "保存到原阅读器书库",
              "元の Reader に保存"), seconds=35)
        tap(("Choose chapter to save", "选择要保存的章节",
             "保存する章を選択"), seconds=25, only_class="Button")
        tap(("Chapter 1",), seconds=35)
        tap(("Save this chapter", "保存这一章", "この章を保存"),
            exact=True, only_class="Button", seconds=20)
        PACKAGE = QA_PACKAGE
        local = None
        deadline = time.monotonic() + 80
        while time.monotonic() < deadline:
            local = next((entry for entry in book_rows() if
                          entry["title"].startswith("Interop Fixture CBZ") and
                          len(entry["pages"]) == 2), None)
            if local:
                break
            time.sleep(.7)
        assert local, "Official upstream chapter did not enter original local library"
        file_root = ("files/local-comics-v1/" + local["id"].removeprefix("local:") +
                     "/" + local["generation"] + "/")
        for i, page_record in enumerate(local["pages"]):
            actual = adb("exec-out", "run-as", QA_PACKAGE, "cat",
                         file_root + page_record["file"], binary=True)
            assert actual == original_pages[i], "Official upstream PNG bytes mismatch"
        PACKAGE = USER_HOST_PACKAGE
        record("official upstream Suwayomi CBZ chapter copied with exact two-page bytes to original Reader-owned inventory")
        page("35-official-upstream-imported-original-reader")

        STEP = "r2-official-upstream-revoke-offline"
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        tap_scrolling(("Disconnect", "断开会话",
                       "セッション終了"), direction="up", only_class="Button")
        adb("shell", "am", "force-stop", USER_HOST_PACKAGE)
        adb("shell", "am", "force-stop", QA_PACKAGE)
        PACKAGE = QA_PACKAGE
        adb("shell", "am", "start", "-W", "-n",
            QA_PACKAGE + "/com.picalibrary.android.LocalLibraryActivity",
            timeout=45)
        wait(("Import CBZ", "导入 CBZ", "CBZ 取込"), seconds=30)
        tap_scrolling("Interop Fixture CBZ", direction="down")
        dismiss_immersive_help()
        wait_page_counter("1 / 2", seconds=40)
        page("36-official-host-stopped-offline-original-reader")
        record("official Host disabled and stopped: separate offline Reader still opens stored real-upstream chapter")
        original_full_product_signed_host_flow(original_pages)
        # Exercise the EXACT original full-product Home/Reader/navigation, now
        # with its compiled Pica/E-H/JM transports physically absent from DEX.
        # Reuse the existing Host, original CBZ fixture and real upstream JAR.
        global ORIGINAL_PACKAGE
        previous_original = ORIGINAL_PACKAGE
        ORIGINAL_PACKAGE = CLEAN_PACKAGE
        try:
            PACKAGE = CLEAN_PACKAGE
            original_app_flow()
            original_full_product_signed_host_flow(original_pages)
            record("clean full product imports and reads real upstream CBZ after Host stop")
        finally:
            ORIGINAL_PACKAGE = previous_original
        (ROOT / "real-upstream-host-proof.json").write_text(json.dumps({
            "upstreamTag": "v2.4.2366",
            "sourceId": "0",
            "actualJarSha256": "af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd",
            "officialUpstreamRuntime": True,
            "thirdPartyExtensionInstalled": False,
            "testComic": "Interop Fixture CBZ",
            "realProviderOrCredentialsUsed": False,
            "readerPackage": QA_PACKAGE,
            "hostPackage": USER_HOST_PACKAGE,
            "sourceFreeReaderHasNetworkPermission": False,
            "byteIdenticalPages": 2,
            "offlineAfterHostStop": True,
            "originalFullProductSignedCompanionFlow": True,
            "originalProductPackage": ORIGINAL_PACKAGE,
            "originalProductOwnLocalPages": 2,
            "originalProductReaderResumesAfterHostStop": True,
            "cleanFourTabOriginalProductTested": True,
            "cleanProductPackage": CLEAN_PACKAGE,
            "cleanProductOwnLocalPages": 2,
            "cleanProductOfflineAfterHostStop": True,
            "originalProductBoundSourceProvidersPresent": False
        }, indent=2), encoding="utf-8")

def clean_original_in_place_upgrade():
    """Real Android PackageManager install -r across two versions of one clean QA app.

    Reuse the original full-product import, Reader, history and saved page stores.
    This proves only isolated .cleanqa OTA mechanics, never the production signer.
    """
    global PACKAGE, STEP
    PACKAGE = CLEAN_PACKAGE
    STEP = "r4-clean-android-preupgrade-snapshot"
    assert installed_version_code(CLEAN_PACKAGE) == 55
    rows = book_rows()
    assert len(rows) >= 2, "Clean original product lost imported local/Host copies before upgrade"
    titles = {row.get("title", "") for row in rows}
    assert any("S3-QA-Comic" in title for title in titles), titles
    assert any("Interop Fixture CBZ" in title for title in titles), titles
    before = []
    for row in sorted(rows, key=lambda value: value["id"]):
        base = ("files/local-comics-v1/" + row["id"].removeprefix("local:") +
                "/" + row["generation"] + "/")
        pages = [hashlib.sha256(adb("exec-out", "run-as", CLEAN_PACKAGE,
                 "cat", base + page["file"], binary=True)).hexdigest()
                 for page in row["pages"]]
        before.append({"id": row["id"], "pages": pages, "count": len(pages)})
    history_before = ledger("reading-history-v1.json")
    assert any(item.get("sourceKind") == "local" and item.get("lastPage", 0) >= 1
               for item in history_before.get("sessions", [])), (
        "Original clean app has no real saved Reader continuation before upgrading")
    accepted_before = app_file("shared_prefs/pica-disclaimer-v1.xml")
    assert "accepted_version" in accepted_before and ">1<" in accepted_before, (
        "Original clean app lacks an actual accepted first-use preference")
    (ROOT / "r4-clean-old-before-replace.json").write_text(json.dumps({
        "package": CLEAN_PACKAGE, "versionCode": 55,
        "books": len(before), "pageCounts": [row["count"] for row in before],
        "pageHashes": [row["pages"] for row in before],
        "hasSavedLocalProgress": True, "hasAcceptedDisclaimer": True,
        "syntheticDataOnly": True
    }, indent=2), encoding="utf-8")

    STEP = "r4-clean-android-real-install-over"
    apk = "mobile/android-alpha2/s3-host-qa-apks/clean-v56.apk"
    assert Path(apk).is_file(), "Next-version clean APK missing"
    # A real PackageManager replace with no -d, uninstall, clear-data or bypass.
    adb("install", "-r", apk, timeout=90)
    assert installed_version_code(CLEAN_PACKAGE) == 56
    PACKAGE = CLEAN_PACKAGE
    after_rows = book_rows()
    after = []
    for row in sorted(after_rows, key=lambda value: value["id"]):
        base = ("files/local-comics-v1/" + row["id"].removeprefix("local:") +
                "/" + row["generation"] + "/")
        pages = [hashlib.sha256(adb("exec-out", "run-as", CLEAN_PACKAGE,
                 "cat", base + page["file"], binary=True)).hexdigest()
                 for page in row["pages"]]
        after.append({"id": row["id"], "pages": pages, "count": len(pages)})
    assert after == before, "Android in-place upgrade changed local comic identities/pages"
    assert ledger("reading-history-v1.json") == history_before, (
        "Android in-place upgrade reset or changed real Reader history")
    assert app_file("shared_prefs/pica-disclaimer-v1.xml") == accepted_before, (
        "Android in-place upgrade lost or rewrote first-use consent")

    STEP = "r4-clean-android-relaunch-resume"
    adb("shell", "am", "force-stop", CLEAN_PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        CLEAN_PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=55)
    # A versioned onboarding may legitimately appear after a clean APK update.
    # Reuse the existing visible "Later" action; never disable the guide or
    # mutate user preferences to make an upgrade check pass.
    later = wait(("稍后再看", "Later", "後で"), seconds=12,
                 required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=40)
    wait("Interop Fixture CBZ", seconds=40)
    page("43-clean-android-inplace-upgrade-home")
    tap("Interop Fixture CBZ", seconds=25)
    tap(("阅读", "Read", "読む"), seconds=35, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("1 / 2", seconds=40)
    page("44-clean-android-inplace-upgrade-offline-reader")
    record("original four-tab clean Android app survives same-package 55-to-56 install -r with "
           "identical saved comics, byte hashes, history and consent; offline Reader reopens")
    (ROOT / "r4-clean-android-inplace-proof.json").write_text(json.dumps({
        "status": "EMULATOR_UPGRADE_PASS", "package": CLEAN_PACKAGE,
        "oldVersionCode": 55, "newVersionCode": 56,
        "sameApplicationId": True, "sameSigningCertificateCheckedBeforeInstall": True,
        "adbReplaceInstall": True, "uninstallOrDataClearUsed": False,
        "bookCount": len(after), "pageHashesUnchanged": True,
        "readingHistoryUnchanged": True, "disclaimerPreferenceUnchanged": True,
        "readerReopenedOffline": True, "syntheticUserDataOnly": True,
        "officialV050InPlaceMigrationVerified": False
    }, indent=2), encoding="utf-8")


def legacy_dev_to_clean_compat_upgrade():
    """Actual same-id Android update from legacy-provider original Dev to clean Reader.

    This is the exact historical original four-tab application package model,
    but on an isolated .dev identity with disposable debug signing. No access
    to the production com.picalibrary.android identity or real user accounts.
    """
    global PACKAGE, STEP
    PACKAGE = ORIGINAL_PACKAGE
    STEP = "r4-legacy-provider-app-before-source-removal"
    assert installed_version_code(ORIGINAL_PACKAGE) == 55
    previous_rows = book_rows()
    assert len(previous_rows) >= 2, "Original legacy Dev app has no two imported comics"
    assert any(row.get("title", "").startswith("Interop Fixture CBZ") for row in previous_rows)
    previous = []
    for row in sorted(previous_rows, key=lambda value: value["id"]):
        base = ("files/local-comics-v1/" + row["id"].removeprefix("local:") +
                "/" + row["generation"] + "/")
        previous.append({
            "id": row["id"], "title": row["title"],
            "pages": [hashlib.sha256(adb("exec-out", "run-as",
                     ORIGINAL_PACKAGE, "cat", base + pg["file"],
                     binary=True)).hexdigest() for pg in row["pages"]]
        })
    previous_history = ledger("reading-history-v1.json")
    assert any(session.get("sourceKind") == "local"
               for session in previous_history.get("sessions", []))
    previous_disclaimer = app_file("shared_prefs/pica-disclaimer-v1.xml")
    # The legacy original app created this provider policy at first launch;
    # the source-neutral app must retain it as opaque old user state while
    # keeping every provider disabled, not migrate credentials to a new host.
    previous_policy = app_file("files/source-access-v1.json")
    assert previous_policy and "schemaVersion" in previous_policy
    (ROOT / "r4-legacy-original-before-source-removal.json").write_text(
        json.dumps({"package": ORIGINAL_PACKAGE, "versionCode": 55,
                    "bookCount": len(previous), "pageHashes":
                        [book["pages"] for book in previous],
                    "historyPresent": True, "legacyPolicyPresent": True,
                    "syntheticOnly": True}, indent=2), encoding="utf-8")

    STEP = "r4-legacy-to-clean-same-identity-package-replacement"
    new_apk = "mobile/android-alpha2/s3-host-qa-apks/clean-compat-dev-v56.apk"
    assert Path(new_apk).is_file(), "Source-neutral original Dev compatible APK missing"
    adb("install", "-r", new_apk, timeout=95)
    assert installed_version_code(ORIGINAL_PACKAGE) == 56
    PACKAGE = ORIGINAL_PACKAGE
    updated = []
    for row in sorted(book_rows(), key=lambda value: value["id"]):
        base = ("files/local-comics-v1/" + row["id"].removeprefix("local:") +
                "/" + row["generation"] + "/")
        updated.append({
            "id": row["id"], "title": row["title"],
            "pages": [hashlib.sha256(adb("exec-out", "run-as",
                     ORIGINAL_PACKAGE, "cat", base + pg["file"],
                     binary=True)).hexdigest() for pg in row["pages"]]
        })
    assert updated == previous, "Legacy Dev -> clean original product changed comic identities/pages"
    assert ledger("reading-history-v1.json") == previous_history, (
        "Legacy Dev -> clean original product changed original Reader history")
    assert app_file("shared_prefs/pica-disclaimer-v1.xml") == previous_disclaimer, (
        "Legacy Dev -> clean original product reset first-use consent")
    assert app_file("files/source-access-v1.json") == previous_policy, (
        "Legacy Dev -> clean original product mutated old provider policy")

    STEP = "r4-legacy-to-clean-continue-offline-reading"
    adb("shell", "am", "force-stop", ORIGINAL_PACKAGE)
    adb("shell", "am", "start", "-W", "-n",
        ORIGINAL_PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=55)
    later = wait(("稍后再看", "Later", "後で"),
                 seconds=12, required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=45)
    wait("Interop Fixture CBZ", seconds=45)
    page("45-legacy-dev-to-clean-original-home")
    tap("Interop Fixture CBZ", seconds=25)
    tap(("阅读", "Read", "読む"), seconds=45, only_class="Button")
    dismiss_immersive_help()
    wait_page_counter("1 / 2", seconds=40)
    page("46-legacy-dev-to-clean-original-offline-reader")
    record("real original Dev legacy-provider app upgrades in place to source-neutral "
           "original four-tab Reader; saved local and Host-imported pages, history, "
           "consent and opaque old source policy stay identical")
    (ROOT / "r4-legacy-dev-to-clean-compat.json").write_text(json.dumps({
        "status": "EMULATOR_LEGACY_TO_CLEAN_PASS",
        "package": ORIGINAL_PACKAGE, "oldCode": 55, "newCode": 56,
        "sameApplicationId": True, "matchingQAInstallSigners": True,
        "actuallyReplacedUsingADB": True, "uninstallOrClearDataUsed": False,
        "oldProviderSDKPhysicallyRemovedInNewApk": True,
        "savedPageBytesUnchanged": True, "bookCount": len(updated),
        "historyUnchanged": True, "firstUseConsentUnchanged": True,
        "oldSourcePolicyOpaqueUnchanged": True, "offlineReaderReopened": True,
        "disposableDevIdentityOnly": True,
        "productionV050ReleaseUpgradeVerified": False
    }, indent=2), encoding="utf-8")


def original_large_shelf_flow():
    """Exercise the ORIGINAL four-tab clean Home with 1,500 owned catalog rows.

    This is a disposable, synthetic Android35 engineering load check, NOT a
    physical-device 1,500-real-book acceptance or a real source download.
    The real UI and existing ShelfLedger/UnifiedCatalogStore files are used;
    there is no alternate app, mock RecyclerView or second data format.
    """
    global PACKAGE, STEP
    PACKAGE = CLEAN_PACKAGE
    STEP = "r3-1500-seed-real-app-private-stores"
    adb("shell", "am", "force-stop", PACKAGE)
    timestamp = "2026-11-03T00:00:00Z"
    fake_entries = []
    fake_items = []
    for index in range(1500):
        comic_id = f"qa-load:{index:04d}"
        title = f"QA_LOAD_{index:04d}"
        fake_entries.append({
            "id": comic_id, "title": title, "author": "QA author",
            "favorite": True, "favoriteRank": index, "inShelf": True,
            "tags": ["QA load"], "categories": ["Synthetic QA"]
        })
        fake_items.append({
            "comicId": comic_id, "title": title, "author": "QA author",
            "canonicalAuthor": "", "tags": ["QA load"],
            "categories": ["Synthetic QA"], "finished": False,
            "downloadedPictures": 0, "knownPictures": 0,
            "updatedAt": timestamp, "deletedAt": ""
        })
    def old_json(filename, empty):
        try:
            return json.loads(adb("exec-out", "run-as", PACKAGE,
                                  "cat", "files/" + filename, binary=True))
        except (ValueError, RuntimeError):
            return empty
    catalog = old_json("unified-catalog-v1.json",
                       {"schemaVersion": 4, "entries": []})
    catalog["schemaVersion"] = 4
    catalog["entries"] = [entry for entry in catalog.get("entries", [])
                          if not str(entry.get("id", "")).startswith("qa-load:")]
    catalog["entries"].extend(fake_entries)
    shelves = old_json("portable-shelves-v1.json",
                       {"schemaVersion": 2, "shelves": []})
    shelves["schemaVersion"] = 2
    shelves["updatedAt"] = timestamp
    shelves["shelves"] = [shelf for shelf in shelves.get("shelves", [])
                          if not str(shelf.get("id", "")).startswith("qa-load-")]
    shelves["shelves"].extend([
        {"id": "qa-load-large", "name": "QA_LOAD_1500",
         "desktopId": "", "updatedAt": timestamp, "deletedAt": "",
         "items": fake_items},
        {"id": "qa-load-small", "name": "QA_SMALL_5",
         "desktopId": "", "updatedAt": timestamp, "deletedAt": "",
         "items": fake_items[:5]}
    ])
    def write_private(filename, value):
        data = json.dumps(value, separators=(",", ":"),
                          ensure_ascii=False).encode("utf-8")
        # adb shell re-parses argv before invoking run-as. A bare 'sh -c'
        # redirection can run as the unprivileged shell instead of this app.
        # Use Android's existing toybox tee inside run-as with a direct,
        # package-private absolute path (never shell-level redirection).
        private_file = "/data/user/0/" + PACKAGE + "/files/" + filename
        command = ["adb", "shell", "-T", "run-as", PACKAGE,
                   "tee", private_file]
        result = subprocess.run(command, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=65)
        if result.returncode:
            raise AssertionError(
                f"Cannot seed synthetic original app store: {filename}: "
                + result.stderr.decode(errors="replace")[-400:])
        observed = adb("exec-out", "run-as", PACKAGE, "cat",
                       private_file, binary=True)
        if observed != data:
            raise AssertionError("Original app private store changed during QA write")
    write_private("unified-catalog-v1.json", catalog)
    write_private("portable-shelves-v1.json", shelves)
    record("actual original clean app-private catalog/shelf schema seeded with exactly 1500 synthetic works")

    STEP = "r3-1500-original-home-open"
    adb("shell", "am", "start", "-W", "-n",
        PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=55)
    later = wait(("稍后再看", "Later", "後で"), seconds=8,
                 required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=45)
    start = time.monotonic()
    tap(("书架", "Shelves", "本棚"), seconds=30,
        exact=True, only_class="Button")
    wait("QA_LOAD_1500", seconds=45)
    if not wait("1500 本", seconds=8, required=False):
        tap("QA_LOAD_1500", seconds=20, only_class="Button")
        wait("1500 本", seconds=45)
    open_ms = round((time.monotonic() - start) * 1000)
    page("47-original-clean-real-1500-shelf")
    record("real original four-tab Shelf screen displays 1500 catalog works using its RecyclerView")

    STEP = "r3-1500-shelf-own-scroll-position"
    def shelf_titles():
        return {title for title, _, _, _ in nodes()
                if re.fullmatch(r"QA_LOAD_\d{4}", title)}
    scrolled_titles = set()
    for _ in range(5):
        adb("shell", "input", "swipe", "360", "965", "360", "410", "300")
        scrolled_titles = shelf_titles()
        if len(scrolled_titles) >= 2 and "QA_LOAD_0000" not in scrolled_titles:
            break
    assert len(scrolled_titles) >= 2, (
        "Original 1500-member RecyclerView did not expose navigable work rows")
    assert "QA_LOAD_0000" not in scrolled_titles, (
        "Original large shelf did not scroll away from first work")
    page("47b-original-clean-1500-shelf-scrolled")
    record("original 1500-work shelf scrolls through work cards without freezing")

    STEP = "r3-1500-switch-between-existing-shelves"
    start = time.monotonic()
    tap("QA_SMALL_5", seconds=20, only_class="Button")
    wait("5 本", seconds=45)
    small_ms = round((time.monotonic() - start) * 1000)
    page("48-original-clean-small-shelf-after-large")
    start = time.monotonic()
    tap("QA_LOAD_1500", seconds=20, only_class="Button")
    wait("1500 本", seconds=45)
    restore_ms = round((time.monotonic() - start) * 1000)
    restored_titles = shelf_titles()
    assert len(scrolled_titles & restored_titles) >= 1, (
        "Switching away from 1500-work shelf lost its independently saved scroll position: "
        + str(sorted(scrolled_titles)[:7]) + " vs "
        + str(sorted(restored_titles)[:7]))
    assert "QA_LOAD_0000" not in restored_titles, (
        "Switching back to the large shelf unexpectedly jumped to its first work")
    page("49-original-clean-large-shelf-returned")
    record("real original 1500-work shelf switches to 5-work shelf and restores prior scroll viewport")

    STEP = "r3-1500-back-to-library-and-filter"
    start = time.monotonic()
    tap(("返回", "Back", "戻る"), seconds=20,
        exact=True, only_class="Button")
    wait(("我的书库", "My library", "マイライブラリ"), seconds=45)
    library_ms = round((time.monotonic() - start) * 1000)
    page("50-original-clean-library-after-1500-shelf")
    record("original Library remains navigable after 1500-work shelf projection and switches")

    (ROOT / "r3-original-1500-shelf-load.json").write_text(json.dumps({
        "result": "EMULATOR_UI_PASS", "originalApp": CLEAN_PACKAGE,
        "catalogRowsSynthetic": 1500, "largeShelfMembers": 1500,
        "smallShelfMembers": 5, "originalShelfStoreUsed": True,
        "originalUnifiedCatalogUsed": True, "originalRecyclerViewUsed": True,
        "openLargeShelfMsObserved": open_ms,
        "switchToSmallShelfMsObserved": small_ms,
        "switchBackToLargeShelfMsObserved": restore_ms,
        "scrolledWorkTitles": len(scrolled_titles),
        "largeShelfScrollPreservedAcrossSwitch": True,
        "libraryAndShelvesUseIndependentViewports": True,
        "returnToOriginalLibraryMsObserved": library_ms,
        "actualRealBooksUsed": False,
        "actualPhysicalDeviceUsed": False, "performanceBudgetApproved": False,
        "syncedOrUserProfilesTouched": False
    }, ensure_ascii=False, indent=2), encoding="utf-8")



def licensed_public_android_source_flow(kind):
    """Same original Android signed Host/Reader path for independent public sites.

    Do not bundle extensions, access accounts, or export site image pixels.
    """
    global PACKAGE, STEP
    specs = {
        "peppercarrot": {
            "env": "PICA_B2_PEPPER_JAR", "size": 137527,
            "sha": "7f0b9912a59c45d8c4ae147fdbed9231558aaa52715886c4dc390368c163c37d",
            "package": "eu.kanade.tachiyomi.extension.all.peppercarrot",
            "name": "Pepper&Carrot", "match": "pepper", "search": "Pepper",
            "chapters": 1, "proof": "b2-public-license-android.json",
        },
        "xkcd": {
            "env": "PICA_B2_XKCD_JAR", "size": 128549,
            "sha": "65548058e8400d82fbe2b30d03bf126012aef6123c103e6abe4de7e788c51701",
            "package": "eu.kanade.tachiyomi.extension.all.xkcd",
            "name": "xkcd", "match": "xkcd", "search": "xkcd",
            "chapters": 2, "proof": "b2-public-license-android-xkcd.json",
        },
    }
    if kind not in specs:
        raise AssertionError("Unrecognized pinned independent public source")
    spec = specs[kind]
    label = spec["name"]
    STEP = "b2-public-licensed-" + kind + "-extension-setup"
    jar = Path(os.environ[spec["env"]]).resolve(strict=True)
    if jar.stat().st_size != spec["size"] or (
            hashlib.sha256(jar.read_bytes()).hexdigest() != spec["sha"]):
        raise AssertionError("Public extension archive digest/size mismatch")
    import importlib.util
    helper_spec = importlib.util.spec_from_file_location(
        "pica_pinned_extension_helper", Path(__file__).with_name(
            "r2-real-extension-host-smoke.py"))
    if helper_spec is None or helper_spec.loader is None:
        raise AssertionError("Existing pinned extension helper unavailable")
    helper = importlib.util.module_from_spec(helper_spec)
    helper_spec.loader.exec_module(helper)
    imported = None
    original_hashes = []
    original_total = 0
    external_source_id = None
    with pinned_official_suwayomi_local_source():
        before_sources = helper.source_ids()
        extension = helper.install_external_archive(jar)
        if (extension.get("pkgName") != spec["package"] or
                extension.get("versionName") != "1.6.1" or
                extension.get("isInstalled") is not True):
            raise AssertionError("Host did not install the exact pinned public extension")
        added = [item for item in helper.source_rows()
                 if item["id"] not in before_sources and
                 spec["match"] in item["name"].lower().replace(" ", "")]
        if len(added) != 1:
            raise AssertionError("Cannot uniquely identify one independent public source")
        external_source_id = added[0]["id"]
        record("pinned independent " + label + " JAR installed in official Host, not in Reader")

        # All app identities are disposable QA packages; never touch stable
        # com.picalibrary.android or any user-owned source/account/profile.
        adb("shell", "pm", "clear", USER_HOST_PACKAGE)
        adb("shell", "am", "force-stop", CLEAN_PACKAGE)
        PACKAGE = CLEAN_PACKAGE
        adb("shell", "am", "start", "-W", "-n",
            CLEAN_PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=55)
        later = wait(("稍后再看", "Later", "後で"), seconds=8,
                     required=False, only_class="Button")
        if later:
            adb("shell", "input", "tap", str(later[0]), str(later[1]))
        wait(("我的书库", "My library", "マイライブラリ"), seconds=55)
        tap(("在线", "Online", "オンライン"), exact=True, only_class="Button")
        tap(("我的外接来源", "My external sources", "外部ソース"), seconds=40)
        PACKAGE = USER_HOST_PACKAGE
        wait(("No Host connected", "尚未连接 Host", "未接続"), seconds=35)

        STEP = "b2-public-licensed-" + kind + "-connect-user-host"
        type_into_host(("Host name", "连接名称", "接続名"),
                       "Licensed_" + kind)
        type_into_host(("Host URL", "Host URL (http:// 或 https://)"),
                       "http://127.0.0.1:4567/")
        tap_scrolling(("Save configuration", "保存配置", "設定を保存"),
                      only_class="Button")
        until_data("user-host-config-v1.json", lambda value:
                   value.get("endpoint") == "http://127.0.0.1:4567/" and
                   value.get("enabled") is False, seconds=30)
        tap_scrolling(("Authorize this Host session",
                       "我授权本次连接自己的 Host", "この接続を許可します"),
                      only_class="CheckBox")
        tap_scrolling(("Enable / disable Host", "启用 / 停用 Host",
                       "Host 有効／無効"), only_class="Button")
        until_data("user-host-config-v1.json",
                   lambda value: value.get("enabled") is True, seconds=30)
        tap_scrolling(("Connect and list sources", "连接并读取来源",
                       "接続してソースを表示"), only_class="Button")

        STEP = "b2-public-licensed-" + kind + "-select-external-source"
        # Select the already installed source by its actual Android Spinner,
        # not by an index or a hard-coded language/LongString identity.
        spinner = None
        for _ in range(12):
            for _, _, bounds, kind in nodes():
                if not kind.endswith("Spinner"):
                    continue
                match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
                if match:
                    x1, y1, x2, y2 = map(int, match.groups())
                    if x1 < x2 and 120 <= (y1+y2)//2 <= 1170:
                        spinner = ((x1+x2)//2, (y1+y2)//2)
                        break
            if spinner:
                break
            adb("shell", "input", "swipe", "360", "980", "360", "420", "320")
        if spinner is None:
            raise AssertionError("Original Host source selector unavailable")
        adb("shell", "input", "tap", str(spinner[0]), str(spinner[1]))
        tap((label,), seconds=35)
        tap_scrolling(("Use selected source", "选择此来源", "ソースを選択"),
                      only_class="Button")

        STEP = "b2-public-licensed-" + kind + "-browse-original-reader"
        tap_scrolling(("Browse this source (no search needed)",
                       "浏览此来源作品（无需搜索词）",
                       "このソースを閲覧（検索語不要）"), only_class="Button")
        tap_scrolling(("Read · " + label, "阅读 · " + label,
                       "読む · " + label), only_class="Button")
        dismiss_immersive_help()
        # Reader chrome may auto-hide; reveal the counter and check two pages
        # without capturing/re-uploading the actual comic artwork.
        first = wait(("1 / ", "1/"), seconds=6, required=False)
        if not first:
            adb("shell", "input", "tap", "360", "480")
            first = wait(("1 / ", "1/"), seconds=70)
        numbers = re.search(r"1\s*/\s*(\d+)", first[2])
        if not numbers or int(numbers.group(1)) < 2:
            raise AssertionError("Actual source did not expose two Reader pages")
        total = int(numbers.group(1))
        advance_reader_next()
        try:
            # Reuse the proven original Reader helper: chrome auto-hides after
            # page turns. A hidden counter is not an image-transfer failure.
            wait_page_counter(("2 / " + str(total), "2/" + str(total)), seconds=50)
        except AssertionError:
            # Inspect the original Reader's existing failure-details dialog,
            # but emit only classified error codes: never a comic image, URL,
            # cookie, account, or unbounded UI text in the public CI log.
            failure_button = find(("Image failed · view details",
                                   "图片读取失败 · 点此查看",
                                   "画像エラー・詳細を見る"))
            if failure_button:
                adb("shell", "input", "tap",
                    str(failure_button[0]), str(failure_button[1]))
                detail_text = " ".join((text or desc) for text, desc, _, _ in nodes())
                codes = sorted(set(re.findall(
                    r"SOURCE_HOST_[A-Z_]+|HTTP [1-5][0-9]{2}|"
                    r"服务器返回的内容不是有效图片|网络请求超时|"
                    r"请求过于频繁|站点拒绝图片请求",
                    detail_text)))
                print("B2 original Reader image failure category: " +
                      (", ".join(codes) if codes else "UNCLASSIFIED"),
                      flush=True)
            raise
        active = adb("shell", "dumpsys", "activity", "activities", timeout=35)
        if ("com.picalibrary.android.ExternalReaderActivity" not in active or
                CLEAN_PACKAGE not in active):
            raise AssertionError("External site did not open original clean ReaderActivity")
        record("real " + label + " source image pages 1 and 2 opened in original clean signed Android Reader")

        STEP = "b2-public-licensed-" + kind + "-save-selected-chapter"
        # Use the original native import chooser for every real chapter.
        # xkcd must save TWO distinct chapters, not two copies of one work.
        saved_records = []
        for selected_index in range(spec["chapters"]):
            if selected_index:
                adb("shell", "input", "keyevent", "KEYCODE_BACK")
            tap_scrolling(("Save to Reader library", "保存到阅读器书库",
                           "Reader 書庫に保存"), direction="down", only_class="Button")
            wait(("Save to original Reader", "保存到原阅读器书库",
                  "元の Reader に保存"), seconds=40)
            tap(("Choose chapter to save", "选择要保存的章节",
                 "保存する章を選択"), seconds=40, only_class="Button")
            chapter_list = next((node for node in hierarchy().iter("node")
                                 if node.attrib.get("class", "").endswith("ListView")), None)
            if chapter_list is None:
                raise AssertionError("Original chapter selector is not a native ListView")
            titles = [node.attrib["text"] for node in chapter_list.iter("node")
                      if node.attrib.get("text", "").strip() and
                      node.attrib.get("class", "").endswith("TextView")]
            if len(titles) < spec["chapters"] or len(set(titles[:spec["chapters"]])) < spec["chapters"]:
                raise AssertionError("Two distinct source chapters are not selectable")
            tap(titles[selected_index], seconds=35, exact=True, only_class="TextView")
            tap(("Save this chapter", "保存这一章", "この章を保存"),
                exact=True, only_class="Button", seconds=35)
            PACKAGE = CLEAN_PACKAGE
            imported = None
            deadline = time.monotonic() + 120
            prior_ids = {book["id"] for book, _ in saved_records}
            while time.monotonic() < deadline:
                imported = next((book for book in book_rows()
                                 if label in book.get("title", "") and
                                 book["id"] not in prior_ids and
                                 len(book.get("pages", [])) >= (2 if selected_index == 0 else 1)), None)
                if imported is not None:
                    break
                time.sleep(1)
            if imported is None:
                raise AssertionError("Selected real chapter did not enter the original local library")
            image_root = ("files/local-comics-v1/" +
                          imported["id"].removeprefix("local:") + "/" +
                          imported["generation"] + "/")
            hashes = []
            for image in imported["pages"]:
                owned = adb("exec-out", "run-as", CLEAN_PACKAGE,
                            "cat", image_root + image["file"], binary=True)
                if len(owned) < 48:
                    raise AssertionError("Source-imported real image page is empty")
                hashes.append(hashlib.sha256(owned).hexdigest())
            saved_records.append((imported, hashes))
            PACKAGE = USER_HOST_PACKAGE
            record("real " + label + " selected chapter " + str(selected_index + 1) +
                   " explicitly saved into original clean app-private library")
        original_total = len(saved_records[0][1])
        imported = saved_records[0][0]

        STEP = "b2-public-licensed-" + kind + "-revoke-host"
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        tap_scrolling(("Disconnect", "断开会话", "セッション終了"),
                      direction="up", only_class="Button")
        adb("shell", "am", "force-stop", USER_HOST_PACKAGE)

    # Pinned official Suwayomi has actually terminated; no ADB reverse or Host.
    STEP = "b2-public-licensed-" + kind + "-offline-after-host-stop"
    try:
        urllib.request.urlopen("http://127.0.0.1:4567/api/graphql", timeout=1)
    except OSError:
        pass
    else:
        raise AssertionError("Suwayomi is still reachable after stop")
    adb("shell", "am", "force-stop", CLEAN_PACKAGE)
    PACKAGE = CLEAN_PACKAGE
    adb("shell", "am", "start", "-W", "-n",
        CLEAN_PACKAGE + "/com.picalibrary.android.DisclaimerActivity", timeout=55)
    later = wait(("稍后再看", "Later", "後で"), seconds=8,
                 required=False, only_class="Button")
    if later:
        adb("shell", "input", "tap", str(later[0]), str(later[1]))
    wait(("我的书库", "My library", "マイライブラリ"), seconds=50)
    offline_books = {book["id"]: book for book in book_rows()}
    for owned_book, original_hashes in saved_records:
        reread = offline_books.get(owned_book["id"])
        if reread is None:
            raise AssertionError("Saved real chapter missing after Host stop")
        image_root = ("files/local-comics-v1/" +
                      reread["id"].removeprefix("local:") + "/" +
                      reread["generation"] + "/")
        after_hashes = [hashlib.sha256(adb(
            "exec-out", "run-as", CLEAN_PACKAGE, "cat",
            image_root + image["file"], binary=True)).hexdigest()
            for image in reread["pages"]]
        if after_hashes != original_hashes:
            raise AssertionError("Saved real source chapter hashes changed after Host stop")
    # The original Home uses a virtualized RecyclerView. On the 1,500+
    # collection, the imported entry can exist in LocalComicStore and pass
    # every byte hash yet be outside the viewport. Exercise the actual
    # search field + IME Search action rather than assuming it is visible.
    search = wait(("",), seconds=25, only_class="EditText")
    adb("shell", "input", "tap", str(search[0]), str(search[1]))
    adb("shell", "input", "text", spec["search"])
    adb("shell", "input", "keyevent", "KEYCODE_ENTER")
    # Hardware Enter must submit the same original Home filter as IME Search.
    # The Android keyboard shrinks Home to ~546px and hides all RecyclerView
    # entries; BACK dismisses ONLY the keyboard so we inspect the real list.
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    # At 360dp the original three-column cover card can be taller than the
    # remaining 320px RecyclerView viewport; its title is BELOW the fold,
    # although the original filter already reports 1 / 1503 matching books.
    # Reuse the product's existing Display > List interaction to reveal
    # the selected work and prove real offline Reader navigation.
    filtered = wait((str(len(saved_records)) + " / ",), seconds=50)
    count = re.search(r"(\d+)\s*/\s*(\d+)", filtered[2])
    if not count or int(count.group(1)) != len(saved_records) or int(count.group(2)) < 1500:
        raise AssertionError("Actual 1500+ library did not retain real source chapters")
    tap(("显示", "Display", "表示"), exact=True, only_class="Button", seconds=25)
    tap(("列表", "List", "リスト"), exact=True, seconds=25)
    wait(imported["title"], seconds=55, only_class="TextView")
    tap(imported["title"], seconds=30, only_class="TextView")
    tap(("阅读", "Read", "読む"), only_class="Button", seconds=40)
    dismiss_immersive_help()
    wait_page_counter(("1 / " + str(original_total),
                       "1/" + str(original_total)), seconds=45)
    record("Host stopped: original four-tab Clean app opens preserved " + label + " real-source offline chapter")
    (ROOT / spec["proof"]).write_text(json.dumps({
        "result": "EMULATOR_PUBLIC_LICENSED_SOURCE_PASS",
        "source": label,
        "sourceId": external_source_id,
        "extensionSha256": spec["sha"],
        "realPagesRead": 2,
        "distinctRealChaptersSaved": len(saved_records),
        "localPagesVerified": sum(len(hashes) for _, hashes in saved_records),
        "offlineHashesIdentical": True,
        "originalFourTabApp": CLEAN_PACKAGE,
        "signedHostPackage": USER_HOST_PACKAGE,
        "hostStopped": True,
        "copyrightedImagesExported": False,
        "physicalDevice": False,
        "userDataTouched": False,
    }, indent=2), encoding="utf-8")


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
        browse_and_resume_flow(comic)
        import_folder()
        export_cbz()
        original_app_flow()
        source_free_user_host_flow()
        official_upstream_android_reader_flow()
        clean_original_in_place_upgrade()
        legacy_dev_to_clean_compat_upgrade()
        original_large_shelf_flow()
        licensed_public_android_source_flow("peppercarrot")
        licensed_public_android_source_flow("xkcd")
        (ROOT / "results.json").write_text(json.dumps({
            "result": "PASS", "source_sha": __import__("os").environ.get("GITHUB_SHA", ""),
            "checks": CHECKS, "browser": "Android 35 emulator ADB real app",
            "package": QA_PACKAGE,
            "also_tested": [ORIGINAL_PACKAGE, CLEAN_PACKAGE, USER_HOST_PACKAGE],
            "network_source": "synthetic, official Suwayomi Local Source, and independent Pepper&Carrot + xkcd public extensions",
            "realPublicSiteOriginalAndroidOffline": True,
            "independentRealPublicSitesVerified": 2},
            ensure_ascii=False, indent=2), encoding="utf-8")
        print("S3 LOCAL END-TO-END PASS", flush=True)
    except Exception as error:
        print(f"S3 LOCAL END-TO-END FAIL at {STEP}: {error}", file=sys.stderr, flush=True)
        # Preserve whether original Home crashed or the system gesture
        # intercepted an actual button. This is the existing ADB evidence flow.
        if STEP.startswith("original-app"):
            runtime = adb("logcat", "-d", "-s", "AndroidRuntime:E",
                          "ActivityTaskManager:W", check=False, timeout=25)
            (ROOT / "original-app-failure.log").write_text(runtime, encoding="utf-8")
            print("Original-app runtime diagnostics:\n" + runtime[-5000:],
                  file=sys.stderr, flush=True)
        (ROOT / "results.json").write_text(json.dumps({
            "result": "FAIL", "step": STEP, "error": str(error), "checks": CHECKS
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        # A licensed public manga page can be visible on failure. Never
        # capture/re-upload third-party comic image pixels in CI artifacts.
        if not STEP.startswith("b2-public-licensed"):
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
