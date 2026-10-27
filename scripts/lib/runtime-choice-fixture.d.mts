export const RUNTIME_CHOICE_FIXTURE_VERSION: string
export const RUNTIME_CHOICE_SCENARIOS: readonly string[]
export function runtimeChoiceReady(status: unknown, capabilities: unknown, mode: string): boolean
export function runtimeChoiceBrowserRequestEvidence(input: string, resourceType: string): {
    kind: 'EXTERNAL_BROWSER_REQUEST_BLOCKED'; protocol: string; resourceType: string; requestClass: string
}
export function runtimeChoicePublication(archives: Record<'core' | 'jm', Buffer>): {
    version: string; latestApi: string; taggedApi: string; sumsUrl: string; latestSumsUrl: string;
    assets: Array<{ mode: 'core' | 'jm'; name: string; browser_download_url: string; digest: string; size: number }>
}
export function createRuntimeChoiceFetch(input: {
    archives: Record<'core' | 'jm', Buffer>; scenario: string; nativeFetch: typeof fetch;
    observe: (row: Record<string, unknown>) => void
}): typeof fetch
