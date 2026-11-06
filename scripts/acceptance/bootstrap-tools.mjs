import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Public build tools only. This does not read accounts, application data or secrets.
const root = path.resolve(process.argv[2] || 'artifacts/acceptance-tools')
fs.mkdirSync(root, { recursive: true })
const receipts = []
async function download(url, name, algorithm = 'sha256', expected) {
    const target = path.join(root, name)
    if (name.endsWith('.zip') && expected) {
        await downloadZip(url, name, algorithm, expected)
        return
    }
    const offset =
        process.argv[4] !== 'fresh' &&
        name.endsWith('.zip') &&
        fs.existsSync(target)
            ? fs.statSync(target).size
            : 0
    const response = await fetch(url, {
        headers: offset ? { Range: `bytes=${offset}-` } : {},
        signal: AbortSignal.timeout(1_800_000)
    })
    if (!response.ok)
        throw new Error(`Download failed (${response.status}): ${url}`)
    const resume = offset > 0 && response.status === 206
    console.log(
        JSON.stringify({
            downloading: name,
            resumedBytes: resume ? offset : 0,
            remainingBytes: response.headers.get('content-length')
        })
    )
    await pipeline(
        Readable.fromWeb(response.body),
        fs.createWriteStream(target, { flags: resume ? 'a' : 'w' })
    )
    const digest = createHash(algorithm)
        .update(fs.readFileSync(target))
        .digest('hex')
    if (expected && digest !== expected.trim().toLowerCase()) {
        fs.unlinkSync(target)
        throw new Error(`Checksum mismatch: ${name}`)
    }
    const receipt = {
        url,
        name,
        bytes: fs.statSync(target).size,
        algorithm,
        digest
    }
    receipts.push(receipt)
    console.log(JSON.stringify(receipt))
}
async function downloadZip(url, name, algorithm, expected) {
    const target = path.join(root, name),
        parts = path.join(root, `${name}.parts`)
    if (
        fs.existsSync(target) &&
        createHash(algorithm).update(fs.readFileSync(target)).digest('hex') ===
            expected.trim()
    ) {
        const receipt = {
            url,
            name,
            bytes: fs.statSync(target).size,
            algorithm,
            digest: expected.trim(),
            cached: true
        }
        receipts.push(receipt)
        console.log(JSON.stringify(receipt))
        return
    }
    const head = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(30_000)
    })
    let total = Number(head.headers.get('content-length'))
    const rangeProbe = await fetch(url, {
        headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(30_000)
    })
    const authoritativeSize = rangeProbe.headers
        .get('content-range')
        ?.match(/\/(\d+)$/)?.[1]
    await rangeProbe.body?.cancel()
    if (authoritativeSize) total = Number(authoritativeSize)
    const size = 1024 * 1024
    if (!head.ok || !Number.isSafeInteger(total) || total < 1)
        throw new Error(`Invalid official archive size: ${name}`)
    fs.mkdirSync(parts, { recursive: true })
    // A previous interrupted stream can seed complete chunks. The final official digest remains mandatory.
    if (fs.existsSync(target)) {
        const prefix = fs.readFileSync(target)
        for (
            let start = 0;
            start + size <= Math.min(prefix.length, total);
            start += size
        ) {
            const part = path.join(parts, `${start}.part`)
            if (!fs.existsSync(part))
                fs.writeFileSync(part, prefix.subarray(start, start + size))
        }
    }
    const starts = Array.from(
        { length: Math.ceil(total / size) },
        (_, index) => index * size
    )
    let cursor = 0,
        completed = 0
    await Promise.all(
        Array.from(
            { length: url.includes('dl.google.com') ? 2 : 4 },
            async () => {
                while (cursor < starts.length) {
                    const start = starts[cursor++],
                        end = Math.min(total, start + size) - 1
                    const part = path.join(parts, `${start}.part`)
                    if (
                        !fs.existsSync(part) ||
                        fs.statSync(part).size !== end - start + 1
                    ) {
                        let lastError
                        for (let attempt = 0; attempt < 3; attempt++) {
                            try {
                                const response = await fetch(url, {
                                    headers: {
                                        Range: `bytes=${start}-${end}`,
                                        'Accept-Encoding': 'identity'
                                    },
                                    signal: AbortSignal.timeout(30_000)
                                })
                                if (
                                    response.status !== 206 ||
                                    response.headers.get('content-range') !==
                                        `bytes ${start}-${end}/${total}`
                                )
                                    throw new Error(
                                        `Unexpected archive range response: ${response.status} ${response.headers.get('content-range')}; expected bytes ${start}-${end}/${total}`
                                    )
                                const bytes = Buffer.from(
                                    await response.arrayBuffer()
                                )
                                if (bytes.length !== end - start + 1)
                                    throw new Error('Incomplete archive range')
                                fs.writeFileSync(part, bytes)
                                lastError = undefined
                                break
                            } catch (error) {
                                lastError = error
                            }
                        }
                        if (lastError) throw lastError
                    }
                    completed++
                    if (completed % 16 === 0 || completed === starts.length)
                        console.log(
                            JSON.stringify({
                                downloading: name,
                                completedChunks: completed,
                                totalChunks: starts.length
                            })
                        )
                }
            }
        )
    )
    const output = `${target}.verified`,
        fd = fs.openSync(output, 'w'),
        hash = createHash(algorithm)
    try {
        for (const start of starts) {
            const bytes = fs.readFileSync(path.join(parts, `${start}.part`))
            fs.writeSync(fd, bytes)
            hash.update(bytes)
        }
    } finally {
        fs.closeSync(fd)
    }
    const digest = hash.digest('hex')
    if (digest !== expected.trim().toLowerCase())
        throw new Error(`Official archive checksum mismatch: ${name}`)
    fs.renameSync(output, target)
    const receipt = { url, name, bytes: total, algorithm, digest }
    receipts.push(receipt)
    console.log(JSON.stringify(receipt))
}
async function text(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
    if (!response.ok)
        throw new Error(`Metadata failed (${response.status}): ${url}`)
    return response.text()
}

const mode = process.argv[3] || 'jm'
if (mode === 'jm') {
    for (const module of [
        'jmcomic-api',
        'jmcomic-core',
        'jmcomic-android-support'
    ]) {
        for (const suffix of ['', '-sources']) {
            const name = `${module}-v1.1.12${suffix}.jar`
            const url = `https://repo.maven.apache.org/maven2/io/github/jukomu/${module}/v1.1.12/${name}`
            const expected = (await text(`${url}.sha256`)).trim()
            await download(url, name, 'sha256', expected)
        }
    }
} else if (mode === 'windows') {
    const node = 'node-v24.15.0-win-x64.zip'
    const checksums = await text(
        'https://nodejs.org/dist/v24.15.0/SHASUMS256.txt'
    )
    const expected = checksums
        .split(/\r?\n/)
        .find((line) => line.endsWith(`  ${node}`))
        ?.split(/\s+/)[0]
    if (!expected) throw new Error('Official Node runtime checksum not found')
    await download(
        `https://nodejs.org/dist/v24.15.0/${node}`,
        node,
        'sha256',
        expected
    )
    const baseline = 'Pica-Library-v0.5.0-windows-x64.zip'
    await download(
        `https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.0/${baseline}`,
        baseline,
        'sha256',
        '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
    )
    fs.mkdirSync('artifacts/cache', { recursive: true })
    fs.mkdirSync('artifacts/release-base', { recursive: true })
    fs.copyFileSync(path.join(root, node), `artifacts/cache/${node}`)
    fs.copyFileSync(
        path.join(root, baseline),
        `artifacts/release-base/${baseline}`
    )
} else if (mode === 'android') {
    const gradle = 'gradle-8.9-bin.zip'
    const url = `https://downloads.gradle.org/distributions/${gradle}`
    await download(url, gradle, 'sha256', await text(`${url}.sha256`))
    const xml = await text(
        'https://dl.google.com/android/repository/repository2-1.xml'
    )
    const packages = [
        ...xml.matchAll(
            /<remotePackage\b[^>]*path="cmdline-tools;([^"]+)"[^>]*>([\s\S]*?)<\/remotePackage>/g
        )
    ]
    const selected = packages.find((match) => match[1] === '19.0')
    if (!selected)
        throw new Error(
            'Pinned official Android command-line tools 19.0 not found'
        )
    const archive = [...selected[2].matchAll(/<archive>([\s\S]*?)<\/archive>/g)]
        .map((match) => match[1])
        .find((value) => /<host-os>windows<\/host-os>/.test(value))
    const file = archive?.match(/<url>([^<]+)<\/url>/)?.[1]
    const checksum = archive?.match(/<checksum[^>]*>([^<]+)<\/checksum>/)?.[1]
    if (
        !file ||
        !checksum ||
        !/^commandlinetools-win-[\w.-]+\.zip$/.test(file)
    ) {
        throw new Error(
            'Official Windows command-line archive metadata is invalid'
        )
    }
    await download(
        `https://dl.google.com/android/repository/${file}`,
        file,
        'sha1',
        checksum
    )
} else throw new Error(`Unknown tool group: ${mode}`)
fs.writeFileSync(
    path.join(root, `${mode}-downloads.json`),
    JSON.stringify(receipts, null, 2) + '\n'
)
