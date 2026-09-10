import type { StoredCredentials } from './types'

export function connectionCredentials(
    input: Record<string, unknown>,
    stored: StoredCredentials | null
) {
    const candidateAccount = String(input.account ?? '')
    const candidatePassword = String(input.password ?? '')
    return {
        account: (candidateAccount.trim()
            ? candidateAccount
            : stored?.account ?? ''
        ).trim(),
        password: candidatePassword.trim()
            ? candidatePassword
            : stored?.password ?? ''
    }
}
