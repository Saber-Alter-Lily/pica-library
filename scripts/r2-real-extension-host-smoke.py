#!/usr/bin/env python3
"""Test a real published source JAR or APK with official Suwayomi on disposable CI only.

Existing Pica/JM/E-H cases test registration only, without any site access.
Open-license Pepper&Carrot / ComicFury cases additionally exercise the original
Reader and offline importer with real sites and transient page bytes.
No accounts, credentials, image artifacts, or private user files are used.
All extension and Host binaries are independently SHA256 pinned.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
HOST_DIGEST = "af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd"
EXTENSIONS = {
    "ehentai": {
        "digest": "6e120f5a488381d4ae8960be3288e31d4d0a50b51b1e70beb0041bb692a88b74",
        "package": "eu.kanade.tachiyomi.extension.en.ehentai",
        "source": "57122881048805941", "version": "1.6.36",
    },
    "picacomic": {
        "digest": "c62a89ce82e67640ef6de0feff3c76030622066d185530fd576264e98f40cb0a",
        "package": "eu.kanade.tachiyomi.extension.zh.picacomic",
        "source": "5768337869316468367", "version": "1.6.14",
    },
    "jinmantiantang": {
        "digest": "5eebd0bae530be491fe1cae32d1940c3914b224c46e7b9d6dd596415ef2c8be7",
        "package": "eu.kanade.tachiyomi.extension.zh.jinmantiantang",
        "source": "6286738698187452081", "version": "1.6.64",
    },
    "peppercarrot": {
        "digest": "7f0b9912a59c45d8c4ae147fdbed9231558aaa52715886c4dc390368c163c37d",
        "package": "eu.kanade.tachiyomi.extension.all.peppercarrot",
        "version": "1.6.1", "query": "Pepper", "title": "Pepper&Carrot",
    },
    "comicfury": {
        "digest": "30744ec9dda0c7d7bdfa352437c383c514c7aae49815166fa4909775c2dde38e",
        "package": "eu.kanade.tachiyomi.extension.all.comicfury",
        "version": "1.6.1", "query": "The Way of the Metagamer",
        "title": "The Way of the Metagamer",
    },
}
ENDPOINT = "http://127.0.0.1:4567/api/graphql"


def pinned(path, expected, size=None):
    file = Path(path).resolve(strict=True)
    if not file.is_file() or (size is not None and file.stat().st_size != size):
        raise AssertionError("Unexpected source or Host binary size/type")
    checksum = hashlib.sha256()
    with file.open("rb") as inp:
        for item in iter(lambda: inp.read(1024 * 1024), b""):
            checksum.update(item)
    if checksum.hexdigest() != expected:
        raise AssertionError("Pinned source or Host binary digest mismatch")
    return file


def graphql(query, variables=None, timeout=30):
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        result = json.loads(response.read(800000).decode())
    if result.get("errors") or not isinstance(result.get("data"), dict):
        raise AssertionError("Suwayomi GraphQL failure: " + str(result.get("errors"))[:1000])
    return result["data"]


def install_external_archive(archive):
    # Uses the upstream's standard multipart Upload scalar. Never inject into
    # the Pica Reader or load third-party code into the application itself.
    query = (
        "mutation Probe($file:Upload!){"
        "installExternalExtension(input:{extensionFile:$file})"
        "{extension{pkgName versionName isInstalled}}}"
    )
    boundary = "pica-r2-" + uuid.uuid4().hex
    body = bytearray()
    for key, item in [
        ("operations", json.dumps({"query": query, "variables": {"file": None}})),
        ("map", json.dumps({"0": ["variables.file"]})),
    ]:
        body.extend(("--" + boundary + "\r\nContent-Disposition: form-data; name=\""
                     + key + "\"\r\n\r\n" + item + "\r\n").encode())
    body.extend(("--" + boundary + "\r\nContent-Disposition: form-data; "
                 "name=\"0\"; filename=\"" + archive.name + "\"\r\n"
                 "Content-Type: " + ("application/vnd.android.package-archive"
                 if archive.suffix.lower() == ".apk" else "application/java-archive")
                 + "\r\n\r\n").encode())
    body.extend(archive.read_bytes())
    body.extend(("\r\n--" + boundary + "--\r\n").encode())
    req = urllib.request.Request(
        ENDPOINT, data=bytes(body),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.loads(response.read(800000).decode())
    if result.get("errors") or not isinstance(result.get("data"), dict):
        raise AssertionError("Pinned real extension install failed: " + str(result.get("errors"))[:1000])
    return result["data"]["installExternalExtension"]["extension"]


def source_rows():
    result = []
    for offset in range(0, 200, 25):
        data = graphql(
            "query Installed($first:Int!,$offset:Int!){"
            "sources(first:$first,offset:$offset){nodes{id name lang supportsLatest}"
            "pageInfo{hasNextPage} totalCount}}",
            {"first": 25, "offset": offset},
        )["sources"]
        result.extend(data["nodes"])
        if not data["pageInfo"]["hasNextPage"]:
            return result
    raise AssertionError("Installed sources exceed bounded 200-row scan")


def source_ids():
    return {row["id"] for row in source_rows()}


def main():
    if (os.getenv("GITHUB_ACTIONS") != "true" or
        os.getenv("GITHUB_REPOSITORY") != "Saber-Alter-Lily/pica-library"):
        raise AssertionError("Only the isolated project CI can execute the external extension")
    host = pinned(os.environ["PICA_R2_HOST_JAR"], HOST_DIGEST, 182952426)
    kind = os.getenv("PICA_R2_SOURCE_KIND")
    if kind not in EXTENSIONS:
        raise AssertionError("Unknown pinned extension case")
    spec = EXTENSIONS[kind]
    extension = pinned(os.environ["PICA_R2_EXTENSION_FILE"], spec["digest"])
    java = Path(os.environ["JAVA_HOME"]) / "bin" / "java"
    if not java.is_file():
        raise AssertionError("JDK21 missing")
    with tempfile.TemporaryDirectory(
        prefix="pica-r2-external-source-", dir=os.environ["RUNNER_TEMP"]
    ) as temp:
        root = Path(temp)
        for folder in ("home", "java-tmp"):
            (root / folder).mkdir()
        cmd = (
            "import {realHostJavaArguments} "
            "from './scripts/lib/source-host-interop-fixture.mjs';"
            "console.log(JSON.stringify(realHostJavaArguments("
            "process.argv[1],process.argv[2])))"
        )
        args = json.loads(subprocess.check_output(
            ["node", "--input-type=module", "-e", cmd, str(root), str(host)],
            cwd=ROOT, text=True,
        ))
        # This test needs GraphQL only, not WebUI asset downloads.
        args.insert(-2, "-Dsuwayomi.tachidesk.config.server.webUIEnabled=false")
        logpath = root / "host.log"
        with logpath.open("wb") as logfile:
            server = subprocess.Popen(
                [str(java), *args], cwd=root, stdin=subprocess.DEVNULL,
                stdout=logfile, stderr=subprocess.STDOUT,
                env={**os.environ, "HOME": str(root / "home"),
                     "TMPDIR": str(root / "java-tmp")},
            )
            try:
                for _ in range(140):
                    if server.poll() is not None:
                        raise AssertionError("Official Host exited during startup")
                    try:
                        info = graphql(
                            "query HostInfo{aboutServer{name version}}",
                            timeout=3,
                        )["aboutServer"]
                        if info["version"].lstrip("v") == "2.4.2366":
                            break
                    except (OSError, ValueError, KeyError, TimeoutError):
                        time.sleep(1)
                else:
                    raise AssertionError("Official Host startup timed out")
                before_sources = source_ids()
                if spec.get("source") in before_sources:
                    raise AssertionError("Unexpected external source pre-installed")
                installed = install_external_archive(extension)
                if (installed.get("pkgName") != spec["package"] or
                    installed.get("versionName") != spec["version"] or
                    installed.get("isInstalled") is not True):
                    raise AssertionError("Real extension package/version rejected")
                added_sources = source_ids() - before_sources
                if spec.get("source") and spec["source"] not in added_sources:
                    raise AssertionError("The pinned source was not registered")
                if not added_sources:
                    raise AssertionError("Extension installed but no source registered")
                if spec.get("query"):
                    rows = [row for row in source_rows()
                            if row["id"] in added_sources]
                    # A single published JAR can register multiple language/site
                    # identities; do not silently bind an arbitrary one.
                    if kind == "comicfury":
                        candidates = [row for row in rows
                                      if row["lang"] in ("en", "all") and
                                      "comicfury" in row["name"].lower().replace(" ", "")]
                    else:
                        candidates = [row for row in rows
                                      if "pepper" in row["name"].lower().replace(" ", "")]
                    if len(candidates) != 1:
                        print(json.dumps({"newRegisteredSources": rows}), flush=True)
                        raise AssertionError("Cannot identify one licensed catalogue by source language/name")
                    selected_source = candidates[0]["id"]
                    probe_env = {key: value for key, value in os.environ.items()
                                 if key not in ("GITHUB_TOKEN", "GH_TOKEN")}
                    probe_env.update({
                        "PICA_B2_SOURCE_ID": selected_source,
                        "PICA_B2_SAMPLE_QUERY": spec["query"],
                        "PICA_B2_SAMPLE_TITLE": spec["title"],
                        "PICA_B2_BROWSE_POPULAR": "1" if kind == "peppercarrot" else "0",
                    })
                    subprocess.run(
                        ["pnpm", "exec", "tsx",
                         "scripts/r2-licensed-source-reader-probe.ts",
                         "online", str(root)],
                        cwd=ROOT, env=probe_env, check=True, timeout=240,
                    )
                removed = graphql(
                    "mutation Remove($id:String!){"
                    "updateExtension(input:{id:$id,patch:{uninstall:true}})"
                    "{extension{pkgName isInstalled}}}",
                    {"id": spec["package"]},
                )["updateExtension"]
                # Upstream may DELETE the external extension database row
                # and return extension:null after a successful uninstall.
                # A stale registered source must still cause a hard failure.
                if (removed.get("extension") is not None and
                    removed["extension"].get("isInstalled") is not False):
                    raise AssertionError("External extension still marked installed")
                if added_sources & source_ids():
                    raise AssertionError("Revoked external source remains registered")
                print(json.dumps({
                    "status": "PASS", "gate": "R2-G2-REAL-EXTENSION-LIFECYCLE", "kind": kind,
                    "officialHost": "Suwayomi 2.4.2366",
                    "extensionPackage": spec["package"],
                    "extensionVersion": spec["version"],
                    "sourceId": next(iter(added_sources)),
                    "installAndUninstallValidated": True,
                    "realMangaSiteAccessed": bool(spec.get("query")),
                    "userCredentialsUsed": False,
                    "productOrReleaseModified": False,
                }))
            except Exception:
                logfile.flush()
                print("Isolated official Host diagnostic tail:\n" +
                      logpath.read_text(errors="replace")[-1400:], file=sys.stderr)
                raise
            finally:
                if server.poll() is None:
                    server.terminate()
                    try:
                        server.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        server.kill()
                        server.wait(timeout=8)
        if spec.get("query"):
            # A separate Node process after the upstream Host has stopped:
            # local Reader must reproduce stored image hashes offline.
            subprocess.run(
                ["pnpm", "exec", "tsx",
                 "scripts/r2-licensed-source-reader-probe.ts",
                 "offline", str(root)],
                cwd=ROOT, check=True, timeout=75,
                env={key: value for key, value in os.environ.items()
                     if key not in ("GITHUB_TOKEN", "GH_TOKEN")},
            )


if __name__ == "__main__":
    main()
