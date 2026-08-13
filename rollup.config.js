import { defineConfig } from 'rollup'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import esbuild from 'rollup-plugin-esbuild'
import { builtinModules } from 'node:module'

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
        commonjs()
    ]
})
