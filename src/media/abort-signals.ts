/** Node >=22.5 provides AbortSignal.any; TS 5.3's DOM typings predate it. */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    return (
        AbortSignal as typeof AbortSignal & {
            any(signals: AbortSignal[]): AbortSignal
        }
    ).any(signals)
}
