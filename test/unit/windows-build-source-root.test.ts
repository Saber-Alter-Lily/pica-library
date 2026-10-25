import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Windows package checkout-root provenance precondition', () => {
    const builder = fs.readFileSync('scripts/build-windows-package.ps1', 'utf8')
    const guard = fs.readFileSync('scripts/lib/assert-checkout-root.ps1', 'utf8')
    it('checks the exact checkout root before taking a Git SHA or any build/deletion action', () => {
        expect(builder).toContain(". (Join-Path $PSScriptRoot 'lib/assert-checkout-root.ps1')")
        const gate = builder.indexOf('Assert-PicaBuildCheckoutRoot -Root $root')
        expect(gate).toBeGreaterThan(0)
        for (const marker of ['$gitSourceSha =', '$env:PICA_LIBRARY_BUILD_PROVENANCE', 'Remove-Item', 'pnpm build', 'Invoke-WebRequest']) expect(gate).toBeLessThan(builder.indexOf(marker))
    })
    it('uses Git working-tree/prefix facts rather than fragile Windows path-string equality', () => {
        expect(guard).toContain('rev-parse --is-inside-work-tree')
        expect(guard).toContain('rev-parse --show-prefix')
        expect(guard).toContain('$LASTEXITCODE -ne 0')
        expect(guard).toContain('$prefix.Length -ne 0')
        expect(guard).toContain('throw ')
    })
    it('keeps the precondition read-only and does not bypass protection or contact a service', () => {
        expect(guard).not.toMatch(/Remove-Item|New-Item|Set-Content|WriteAll|Start-Process|Invoke-WebRequest|Set-ExecutionPolicy|ExecutionPolicy|git\s+(?:init|checkout|switch|reset|commit|push)/i)
    })
})
