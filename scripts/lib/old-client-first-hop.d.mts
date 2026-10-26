export const FIRST_HOP_BASELINE: Readonly<{version:string;sourceSha:string;zipSha256:string;desktopSha256:string;helperSha256:string}>
export const FIRST_HOP_SCENARIOS: readonly string[]
export const FIRST_HOP_FIXTURE_VERSION: string
export function sha256(bytes: Uint8Array | string): string
export function assertDisposableWindowsCi(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): void
export function firstHopPublication(scenario: string): {version:string;archiveName:string;latestApi:string;taggedApi:string;archiveUrl:string;sumsUrl:string;latestSumsUrl:string;releaseUrl:string}
export function loopbackHost(value: unknown): boolean
export function localConnectTarget(value: unknown): boolean
export function createFirstHopFetch(input: {scenario:string;archiveBytes:Uint8Array;releasedDesktop:()=>boolean;nativeFetch:typeof fetch;observe:(event:Record<string,unknown>)=>void}): typeof fetch
