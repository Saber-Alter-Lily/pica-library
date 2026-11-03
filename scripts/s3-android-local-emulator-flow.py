#!/usr/bin/env python3
"""Operate the actual isolated Android QA APK via ADB and system SAF UI.

Uses Python's standard library, Android's own UI hierarchy and the original
application files. No extra test framework, simulated Reader or source login.
"""
import json
import re
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import struct
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

QA_PACKAGE = "com.picalibrary.android.localcore.qa"
ORIGINAL_PACKAGE = "com.picalibrary.android.dev"
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
                data={"sources":{"nodes":[{"id":source,"name":"User installed fixture",
                      "lang":"en","supportsLatest":True}],
                      "pageInfo":{"hasNextPage":False,"hasPreviousPage":False},"totalCount":1}}
            elif name=="PicaHostSourceSearch":
                data={"fetchSourceManga":{"mangas":[book],"hasNextPage":False}}
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
        tap_scrolling(("Use selected source","选择此来源","ソースを選択"),
                      only_class="Button")
        type_into_host(("Search works","搜索作品","作品を検索"),"synthetic")
        tap_scrolling(("Search selected source","搜索选中来源","選択ソースで検索"),
                      only_class="Button")
        wait_host_operation(operations,"PicaHostSourceSearch")
        tap_scrolling("S3-QA-Hosted-Comic",direction="down",only_class="Button")
        wait_page_counter("1 / 2",seconds=45)
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
        # No Host-side local inventory: user explicitly saves straight into
        # the sole original Reader library through the signed Binder bridge.
        tap_scrolling(("Save to Reader library",
                       "保存到阅读器书库","Reader 書庫に保存"),
                      direction="down",only_class="Button")
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
        tap_scrolling(("Back to Reader","返回阅读器","Reader に戻る"),
                      direction="up",only_class="Button")
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
        host_apk = "mobile/android-alpha2/user-host-app/build/outputs/apk/debug/user-host-app-v2-debug.apk"
        assert installed_version_code(USER_HOST_PACKAGE)==1
        operations_before_upgrade=len(operations)
        adb("install", "-r", host_apk, timeout=65)
        assert installed_version_code(USER_HOST_PACKAGE)==2
        PACKAGE=USER_HOST_PACKAGE
        until_data("user-host-config-v1.json", lambda data:
            data.get("label")=="QA_Host" and data.get("enabled") is True)
        assert len(operations)==operations_before_upgrade, (
            "Source update triggered a Host request without user action")
        record("different versionCode QA source APK upgrades in place and retains consent/config without auto-connecting")

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
        assert len(operations)==operations_before_upgrade, (
            "Source reinstall triggered a Host request without user action")
        record("optional v2 source reinstall restores same-signer management without implicit network connection")
        PACKAGE=USER_HOST_PACKAGE
        assert all(item in operations for item in ("PicaSourceHostInfo",
            "PicaSourceHostSources","PicaHostSourceSearch","PicaHostManga",
            "PicaHostChapter","PicaHostChapterPages","PicaHostPrepareManga")),operations
        (ROOT/"synthetic-host-operations.json").write_text(json.dumps(
            {"operations":operations,"syntheticOnly":True},indent=2),
            encoding="utf-8")

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
        (ROOT / "results.json").write_text(json.dumps({
            "result": "PASS", "source_sha": __import__("os").environ.get("GITHUB_SHA", ""),
            "checks": CHECKS, "browser": "Android 35 emulator ADB real app",
            "package": QA_PACKAGE,
            "also_tested": [ORIGINAL_PACKAGE, USER_HOST_PACKAGE],
            "network_source": "synthetic loopback Suwayomi only"},
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
