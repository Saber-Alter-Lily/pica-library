import { defineConfig } from 'rollup'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import esbuild from 'rollup-plugin-esbuild'
import { builtinModules } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

function bundledLicenses() {
    return {
        name: 'bundled-third-party-licenses',
        generateBundle() {
            const packages = new Map()
            for (const id of this.getModuleIds()) {
                if (!id.includes('node_modules')) continue
                let directory = path.dirname(id.split('?')[0])
                while (directory !== path.dirname(directory)) {
                    const packageFile = path.join(directory, 'package.json')
                    if (fs.existsSync(packageFile)) {
                        const metadata = JSON.parse(
                            fs.readFileSync(packageFile, 'utf8')
                        )
                        if (metadata.name && metadata.version) {
                            packages.set(
                                `${metadata.name}@${metadata.version}`,
                                {
                                    directory,
                                    name: metadata.name,
                                    version: metadata.version,
                                    license: metadata.license ?? 'SEE LICENSE'
                                }
                            )
                            break
                        }
                    }
                    directory = path.dirname(directory)
                }
            }
            const sections = [
                'THIRD-PARTY SOFTWARE NOTICES',
                '',
                'Generated deterministically from the Rollup module graph.',
                ''
            ]
            for (const item of [...packages.values()].sort((a, b) =>
                a.name.localeCompare(b.name)
            )) {
                const licenseFile = fs
                    .readdirSync(item.directory)
                    .sort()
                    .find((name) =>
                        /^(licen[cs]e|copying)([-.].*)?$/i.test(name)
                    )
                if (!licenseFile)
                    this.error(
                        `License file missing for bundled package ${item.name}`
                    )
                sections.push(
                    '='.repeat(72),
                    `${item.name}@${item.version}`,
                    `Declared license: ${item.license}`,
                    `Source license file: ${licenseFile}`,
                    '='.repeat(72),
                    '',
                    fs
                        .readFileSync(
                            path.join(item.directory, licenseFile),
                            'utf8'
                        )
                        .trim(),
                    ''
                )
            }
            this.emitFile({
                type: 'asset',
                fileName: 'licenses/THIRD_PARTY_LICENSES.txt',
                source: `${sections.join('\n')}\n`
            })
        }
    }
}

export default defineConfig({
    input: {
        'pica-library': 'src/library-cli.ts',
        desktop: 'src/desktop/main.ts'
    },
    output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        format: 'es'
    },
    // Windows distribution carries no node_modules. Bundle all JavaScript
    // dependencies and leave only the official Node runtime built-ins external.
    external: [...builtinModules, /node:/],
    plugins: [
        json(),
        esbuild({
            platform: 'node',
            minify: true
        }),
        nodeResolve(),
        commonjs(),
        bundledLicenses()
    ]
})
