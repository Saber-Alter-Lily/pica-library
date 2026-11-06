export const RUNTIME_CHOICE_ROUTES = [
    '/api/v1/update/runtime-choice/plan',
    '/api/v1/update/runtime-choice/prepare'
] as const
export function runtimeChoiceAuthority(input: {
    method?: string
    search: string
    peer: string
    host: string
    origin?: string
    token?: string | string[]
    expectedToken?: string
}) {
    if (
        input.method !== 'POST' ||
        input.search ||
        !input.expectedToken ||
        input.token !== input.expectedToken ||
        input.origin !== `http://${input.host}` ||
        !/^(?:127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/.test(
            input.peer
        )
    )
        return false
    try {
        return ['127.0.0.1', 'localhost', '[::1]'].includes(
            new URL(`http://${input.host}`).hostname
        )
    } catch {
        return false
    }
}
export function runtimeChoiceCommand(
    route: string,
    value: unknown
):
    | { action: 'plan'; choice: 'core' | 'jm' }
    | { action: 'prepare'; id: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('Invalid runtime component command')
    const input = value as Record<string, unknown>
    if (
        route === RUNTIME_CHOICE_ROUTES[0] &&
        Object.keys(input).length === 1 &&
        (input.choice === 'core' || input.choice === 'jm')
    )
        return { action: 'plan', choice: input.choice }
    if (
        route === RUNTIME_CHOICE_ROUTES[1] &&
        Object.keys(input).length === 1 &&
        typeof input.id === 'string' &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.id)
    )
        return { action: 'prepare', id: input.id }
    throw Error('Invalid runtime component command')
}
