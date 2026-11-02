/** The standard zero-Host Desktop core preview remains an executable-only entry. */
import { runCoreDesktopPreview } from './core-preview-runtime'

// Explicit CLI. Importing the pure function for tests must not start a server.
if (process.argv[1] &&
    /(?:^|[/\\])desktop-core-preview\.(?:mjs|js)$/.test(process.argv[1]))
    void runCoreDesktopPreview().catch(error => {
        process.stderr.write('CORE_DESKTOP_PREVIEW_REJECTED: ' +
            (error instanceof Error ? error.message : String(error)) + '\n')
        process.exitCode = 1
    })
