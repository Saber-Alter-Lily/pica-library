import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

function versionContract(workflow: string) {
    const authorities = [
        ...workflow.matchAll(
            /^  PICA_ANDROID_CANDIDATE_VERSION_CODE: '(\d+)'$/gm
        )
    ]
    return (
        authorities.length === 1 &&
        Number(authorities[0][1]) > 82 &&
        workflow.includes(
            'export PICA_ANDROID_VERSION_CODE="$PICA_ANDROID_CANDIDATE_VERSION_CODE"'
        ) &&
        workflow.includes(
            'grep -q "versionCode=\'$PICA_ANDROID_CANDIDATE_VERSION_CODE\'" "$RUNNER_TEMP/next-package.txt"'
        ) &&
        !/export PICA_ANDROID_VERSION_CODE=\d/.test(workflow) &&
        !/grep -q "versionCode='\d+'"/.test(workflow)
    )
}

describe('unpublished Android build and manifest version authority', () => {
    it('builds and verifies Dev83 from one public authority without weakening package/certificate gates', () => {
        const workflow = fs.readFileSync(
            '.github/workflows/next-consolidated-acceptance.yml',
            'utf8'
        )
        expect(versionContract(workflow)).toBe(true)
        expect(workflow).toContain('test "$cert" = "$EXPECTED_CERT"')
        expect(workflow).toContain('com.picalibrary.android.dev')
        expect(workflow).toContain("application-label:'Pica Library Dev'")
        expect(workflow).toContain(
            'Dev manifest versionCode does not match expected'
        )
    })
    it('rejects the retained independent build71/verify70 counterexample', () => {
        const workflow = fs.readFileSync(
            '.github/workflows/next-consolidated-acceptance.yml',
            'utf8'
        )
        const previous = workflow
            .replace(
                'export PICA_ANDROID_VERSION_CODE="$PICA_ANDROID_CANDIDATE_VERSION_CODE"',
                'export PICA_ANDROID_VERSION_CODE=71'
            )
            .replace(
                'grep -q "versionCode=\'$PICA_ANDROID_CANDIDATE_VERSION_CODE\'"',
                'grep -q "versionCode=\'70\'"'
            )
        expect(versionContract(previous)).toBe(false)
    })
})
