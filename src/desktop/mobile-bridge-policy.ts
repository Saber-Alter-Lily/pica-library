/** A saved user choice wins; an absent choice never implies LAN consent. */
export function mobileBridgeOptIn(
    config: { mobileBridgeEnabled?: boolean } | null,
    explicitStartupOptIn = false,
    mode: 'interactive' | 'headless' = 'interactive'
) {
    // Preserve headless's stronger command-line opt-in boundary.
    if (mode === 'headless' && !explicitStartupOptIn) return false
    return config?.mobileBridgeEnabled === undefined
        ? explicitStartupOptIn
        : config.mobileBridgeEnabled === true
}

export function parseMobileBridgeChoice(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid Mobile Bridge choice')
    const value = input as Record<string, unknown>
    if (
        value.mobileBridgeAction !== 'set-enabled' ||
        typeof value.enabled !== 'boolean' ||
        Object.keys(value).some(
            (key) => !['mobileBridgeAction', 'enabled'].includes(key)
        )
    )
        throw new Error('Invalid Mobile Bridge choice')
    return value.enabled
}
