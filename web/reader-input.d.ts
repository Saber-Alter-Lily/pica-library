export interface ReaderKeyboardEvent {
    readonly key: string
    readonly defaultPrevented?: boolean
    readonly isComposing?: boolean
    readonly keyCode?: number
    readonly altKey?: boolean
    readonly ctrlKey?: boolean
    readonly metaKey?: boolean
    readonly shiftKey?: boolean
}
export interface ReaderKeyboardContext {
    readonly active: boolean
    readonly blocked: boolean
    readonly fullscreen: boolean
    readonly mode: string
}
export function readerKeyboardAction(event: ReaderKeyboardEvent, context: ReaderKeyboardContext): -1 | 1 | 'exit' | null
export function readerPageIndex(view: { readonly pageIndex: number; readonly total: number; readonly mode: string; readonly direction: string }, delta: number): number | null
