/** Minimal inert DOM for the actual read-panel module. No browser/network/HTML parser. */
class Events {
    private readonly listeners = new Map<string, Set<(event: any) => void>>()
    addEventListener(name: string, action: (event: any) => void) { const set = this.listeners.get(name) ?? new Set(); set.add(action); this.listeners.set(name, set) }
    removeEventListener(name: string, action: (event: any) => void) { this.listeners.get(name)?.delete(action) }
    dispatchEvent(event: { type: string; detail?: unknown }) { for (const action of this.listeners.get(event.type) ?? []) action(event); return true }
}
export class ReadingElement extends Events {
    children: ReadingElement[] = []
    parentElement: ReadingElement | null = null
    id = ''; type = ''; className = ''; hidden = false; disabled = false; checked = false; required = false; maxLength = 0; placeholder = ''; autocomplete = ''; open = false
    readonly style: Record<string, string> = {}
    readonly dataset: Record<string, string> = {}
    onclick?: (event?: any) => unknown
    onchange?: (event?: any) => unknown
    onkeydown?: (event?: any) => unknown
    onsubmit?: (event?: any) => unknown
    private ownText = ''
    private ownValue = ''
    private readonly attributes = new Map<string, string>()
    constructor(readonly tagName: string) { super() }
    get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join('') }
    set textContent(value: string) { this.replaceChildren(); this.ownText = String(value) }
    set innerHTML(_value: string) { throw new Error('Unsafe HTML assignment in read-panel test') }
    get value() { return this.tagName === 'select' && !this.options.some(option => option.value === this.ownValue) ? this.options[0]?.value ?? '' : this.ownValue }
    set value(value: string) { this.ownValue = value }
    get options() { return this.children.filter(child => child.tagName === 'option') }
    setAttribute(name: string, value: string) { this.attributes.set(name, value) }
    getAttribute(name: string) { return this.attributes.get(name) ?? null }
    append(...values: ReadingElement[]) { for (const value of values) { value.parentElement?.removeChild(value); value.parentElement = this; this.children.push(value) } }
    removeChild(value: ReadingElement) { this.children = this.children.filter(child => child !== value); value.parentElement = null }
    replaceChildren(...values: ReadingElement[]) { for (const child of this.children) child.parentElement = null; this.children = []; this.ownText = ''; this.append(...values) }
    querySelectorAll(tag: string): ReadingElement[] { return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]) }
    closest(tag: string): ReadingElement | null { return this.tagName === tag ? this : this.parentElement?.closest(tag) ?? null }
    async click() { if (!this.disabled) return await this.onclick?.({ preventDefault() {} }) }
    reportValidity() { return true }
    showModal() { this.hidden = false; this.open = true }
    close() { this.hidden = true; this.open = false; this.dispatchEvent({ type: 'close' }) }
}
export function inertReadingDom() {
    const window = new Events(), documentEvents = new Events(), body = new ReadingElement('body'), created: string[] = []
    const document = {
        body,
        createElement(tag: string) { created.push(tag); return new ReadingElement(tag) },
        getElementById(id: string): ReadingElement | null { const visit = (element: ReadingElement): ReadingElement | null => element.id === id ? element : element.children.map(visit).find(Boolean) ?? null; return visit(body) },
        addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents), dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents)
    }
    return { window, document, body, created }
}
