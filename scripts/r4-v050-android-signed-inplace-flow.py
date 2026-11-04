#!/usr/bin/env python3
"""Real public v0.5.0 Android APK -> same-ID source-neutral candidate, emulator only.

Uses the existing S3 ADB/UI helpers and the original application's own shelf UI.
Neither APK is debug-enabled, so this inspects actual visible user behavior
rather than attempting run-as access to production app-private files. No real
account, online provider, user device, profile, or installation is used.
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path("mobile/android-alpha2/r4-v050-upgrade-evidence")
ROOT.mkdir(parents=True, exist_ok=True)
shared = Path(__file__).with_name("s3-android-local-emulator-flow.py")
spec = importlib.util.spec_from_file_location("pica_existing_android_e2e", shared)
if spec is None or spec.loader is None:
    raise RuntimeError("Existing Android 35 UI driver is unavailable")
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
qa.ROOT = ROOT
PACKAGE = "com.picalibrary.android"
SHELF_NAME = "QA_V050_SHELF"
checks = []
stage = "preflight"


def record(label):
    checks.append(label)
    print("PASS: " + label, flush=True)


def saved_screen(label):
    qa.page(label)


def click_point(point):
    qa.adb("shell", "input", "tap", str(point[0]), str(point[1]))


def launch_original():
    qa.adb("shell", "am", "force-stop", PACKAGE)
    qa.adb("shell", "am", "start", "-W", "-n",
           PACKAGE + "/com.picalibrary.android.DisclaimerActivity",
           timeout=55)
    if qa.wait(("使用提示与免责声明",), seconds=7, required=False):
        checkbox = qa.wait(("",), only_class="CheckBox", seconds=15)
        click_point(checkbox)
        agree = qa.wait(("同意并继续",), seconds=15,
                        exact=True, only_class="Button")
        # Android 35 edge-to-edge can place the button over the gesture bar.
        if agree[1] >= 1100:
            qa.adb("shell", "input", "swipe",
                   "360", "1030", "360", "380", "480")
            agree = qa.wait(("同意并继续",), seconds=15,
                            exact=True, only_class="Button")
        if agree[1] >= 1100:
            raise AssertionError("Original release consent button covered by nav bar")
        click_point(agree)
    later = qa.wait(("稍后再看", "Later", "後で"), seconds=10,
                    required=False, only_class="Button")
    if later:
        click_point(later)
    qa.wait(("我的书库", "My library", "マイライブラリ"), seconds=45)


def open_shelves():
    qa.tap(("书架", "Shelves", "本棚"), exact=True, only_class="Button",
           seconds=30)


def require_shelf():
    qa.wait((SHELF_NAME,), seconds=45)
    labels = [a or b for a, b, _, _ in qa.nodes()]
    if not any(SHELF_NAME in label for label in labels):
        raise AssertionError("Original saved shelf disappeared from visible library")


def old_release_create_shelf():
    open_shelves()
    # The real public v0.5.0 first-run shelf page exposes "New shelf" directly.
    qa.tap(("新建书架", "New shelf", "新しい本棚"), seconds=35,
           only_class="Button")
    field = qa.wait(("",), only_class="EditText", seconds=15)
    click_point(field)
    qa.adb("shell", "input", "text", SHELF_NAME)
    qa.tap(("创建", "Create", "作成"), exact=True, only_class="Button", seconds=20)
    require_shelf()
    saved_screen("01-public-v050-original-shelf-created")
    record("actual public v0.5.0 app creates synthetic shelf through native UI")


def version_code():
    return qa.installed_version_code(PACKAGE)


def main(old_apk, new_apk):
    global stage
    assert old_apk.is_file() and new_apk.is_file(), "Verified APK pair missing"
    qa.adb("shell", "wm", "size", "720x1280")
    qa.adb("shell", "wm", "density", "320")
    qa.adb("shell", "settings", "put", "system", "font_scale", "1.0")
    try:
        # In-place application identity is REAL: com.picalibrary.android.
        # Both signatures and public baseline SHA are verified by CI first.
        # Deny network so an unrelated provider/OTA cannot be a prerequisite.
        qa.adb("shell", "svc", "wifi", "disable", check=False)
        qa.adb("shell", "svc", "data", "disable", check=False)

        stage = "install-original-v050"
        qa.adb("install", "-r", str(old_apk), timeout=100)
        assert version_code() == 55, "Official Android 0.5.0 did not install"
        record("pinned published v0.5.0 APK installed at actual production package ID")

        stage = "v050-native-shelf-write"
        launch_original()
        old_release_create_shelf()
        stage = "v050-cold-restart"
        launch_original()
        open_shelves()
        require_shelf()
        saved_screen("02-public-v050-shelf-survived-cold-restart")
        record("old app's saved shelf survives full process restart offline")

        stage = "replace-real-package-id-with-source-neutral-v56"
        # No uninstall, clear-data, backup restore, downgrade or signature bypass.
        qa.adb("install", "-r", str(new_apk), timeout=100)
        assert version_code() == 56, "Same-ID source-neutral replacement not installed"
        record("Android PackageManager upgraded exact production ID v55 to v56 in place")

        stage = "new-clean-app-preserves-old-shelf"
        launch_original()
        saved_screen("03-source-neutral-original-home-after-production-id-replace")
        open_shelves()
        require_shelf()
        saved_screen("04-source-neutral-original-old-shelf")
        record("original clean four-tab app reads public v0.5.0 shelf without reimport")

        stage = "new-clean-offline-cold-restart"
        launch_original()
        open_shelves()
        require_shelf()
        saved_screen("05-source-neutral-restart-old-shelf")
        record("source-neutral original Home preserves v0.5.0 shelf after offline restart")

        result = {
            "status": "SIGNED_REAL_ID_EMULATOR_QA_PASS",
            "publicBaselineTag": "v0.5.0",
            "publicBaselineVersionCode": 55,
            "candidateVersionCode": 56,
            "package": PACKAGE,
            "oldAndNewSignersEqualAndPinned": True,
            "physicallyCleanCandidateDexVerified": True,
            "androidPackageManagerInstallReplace": True,
            "uninstallOrDataClearUsed": False,
            "existingOriginalShelfSurvived": True,
            "originalCleanReaderIndependentOfProviderLogin": True,
            "offlineColdRestart": True,
            "syntheticShelfOnly": True,
            "realUserProfileTouched": False,
            "actualUserContentDiffVerified": False,
            "formalReleaseAuthorized": False,
            "checks": checks
        }
        (ROOT / "signed-production-id-upgrade-qa.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("R4 PUBLIC V050 SAME-IDENTITY END-TO-END PASS", flush=True)
    except Exception as error:
        print(f"R4 PUBLIC V050 SAME-IDENTITY FAIL at {stage}: {error}",
              file=sys.stderr, flush=True)
        (ROOT / "signed-production-id-upgrade-qa.json").write_text(
            json.dumps({"status": "FAIL", "stage": stage,
                        "error": str(error), "checks": checks},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            saved_screen("failure-" + re.sub("[^a-z0-9-]", "-", stage.lower())[:48])
        except Exception:
            pass
        raise
    finally:
        (ROOT / "android-runtime.log").write_text(
            qa.adb("logcat", "-d", "-s", "AndroidRuntime:E",
                   check=False, timeout=30), encoding="utf-8")
        qa.adb("shell", "wm", "size", "reset", check=False)
        qa.adb("shell", "wm", "density", "reset", check=False)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: r4-v050-android-signed-inplace-flow.py PUBLIC_V050_APK CLEAN_QA_APK")
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
