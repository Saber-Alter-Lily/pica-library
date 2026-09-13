/** Provider account input only. Never persist registration security answers. */
export interface PicaRegistration {
    name: string
    email: string
    password: string
    birthday: string
    gender: 'm' | 'f' | 'bot'
    question1: string
    question2: string
    question3: string
    answer1: string
    answer2: string
    answer3: string
}

const NEW_USERNAME = /^[A-Za-z0-9._]{1,16}$/

export function validatePicaRegistration(
    input: Record<string, unknown>,
    now = new Date()
): PicaRegistration {
    const text = (key: string, min: number, max: number, trim = true) => {
        const raw = input[key]
        const value = typeof raw === 'string' ? (trim ? raw.trim() : raw) : ''
        if (
            value.length < min ||
            value.length > max ||
            Array.from(value).some((character) => character.charCodeAt(0) < 32)
        )
            throw new Error(`注册字段不完整或格式错误：${key}`)
        return value
    }
    if (input.acceptedTerms !== true)
        throw new Error('请确认年龄要求、第三方服务条款和隐私说明')
    const birthday = text('birthday', 10, 10)
    const date = new Date(`${birthday}T00:00:00Z`)
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== birthday
    )
        throw new Error('请填写有效的出生日期（YYYY-MM-DD）')
    const today = now.toISOString().slice(0, 10)
    const age =
        Number(today.slice(0, 4)) -
        date.getUTCFullYear() -
        (today.slice(5) < birthday.slice(5) ? 1 : 0)
    if (age < 18) throw new Error('此服务仅限年满 18 岁的用户注册')
    if (!['m', 'f', 'bot'].includes(String(input.gender)))
        throw new Error('请选择性别选项')
    const username = text('email', 1, 16)
    if (!NEW_USERNAME.test(username))
        throw new Error('用户名应为 1–16 位字母、数字、点或下划线')
    const password = text('password', 8, 128, false)
    if (input.confirmPassword !== password)
        throw new Error('两次输入的密码不一致')
    return {
        name: text('name', 2, 50),
        // The provider calls the username field `email`; it is not required to be an email address.
        email: username,
        password,
        birthday,
        gender: input.gender as PicaRegistration['gender'],
        question1: text('question1', 1, 200),
        question2: text('question2', 1, 200),
        question3: text('question3', 1, 200),
        answer1: text('answer1', 1, 200, false),
        answer2: text('answer2', 1, 200, false),
        answer3: text('answer3', 1, 200, false)
    }
}

export type PicaAccountCategory =
    | 'NETWORK'
    | 'USERNAME_TAKEN'
    | 'INVALID_USERNAME'
    | 'INVALID_PASSWORD'
    | 'INVALID_BIRTHDAY'
    | 'INVALID_NICKNAME'
    | 'INVALID_RECOVERY'
    | 'VALIDATION'
    | 'RATE_LIMIT'
    | 'UNAVAILABLE'
    | 'REJECTED'
    | 'RESPONSE'

const accountMessages: Record<PicaAccountCategory, string> = {
    NETWORK:
        '无法连接 Pica API。注册本身不强制使用代理，但当前网络未能连通；请开启系统代理/加速器或配置 HTTP/HTTPS 代理后再试。',
    USERNAME_TAKEN:
        '该用户名已被注册。请更换用户名；如果你刚刚提交过一次注册，请先返回登录确认账号是否已经创建。',
    INVALID_USERNAME:
        '用户名未被 Pica 接受。新用户名请使用 1–16 位字母、数字、点或下划线。',
    INVALID_PASSWORD:
        '密码未被 Pica 接受。请使用至少 8 个字符的密码，并确认两次输入完全一致。',
    INVALID_BIRTHDAY:
        '出生日期未被 Pica 接受。请使用 YYYY-MM-DD 的有效日期，并确认已年满 18 岁。',
    INVALID_NICKNAME:
        '昵称未被 Pica 接受。请使用 2–50 个字符的昵称后重试。',
    INVALID_RECOVERY:
        '安全问题或答案未被 Pica 接受。请完整填写 3 组安全问题和答案。',
    VALIDATION:
        'Pica 未接受部分注册资料。请检查用户名、昵称、生日、密码和 3 组安全问题/答案。',
    RATE_LIMIT: 'Pica 请求过于频繁，请稍后再试，不要连续重复提交。',
    UNAVAILABLE: 'Pica 账号服务暂时不可用，请稍后再试。',
    REJECTED:
        'Pica 拒绝了账号请求，但未返回可安全识别的具体原因。请检查填写信息后重试。',
    RESPONSE:
        'Pica 账号响应异常，结果尚未确认。请先尝试登录，不要重复注册。'
}

export class PicaAccountError extends Error {
    constructor(
        readonly category: PicaAccountCategory,
        readonly httpStatus?: number
    ) {
        super(accountMessages[category] ?? accountMessages.RESPONSE)
        this.name = 'PicaAccountError'
    }
}

function providerSignals(payload: unknown) {
    if (!payload || typeof payload !== 'object') return { text: '', errorCode: NaN }
    const value = payload as Record<string, unknown>
    const nested =
        value.data && typeof value.data === 'object'
            ? (value.data as Record<string, unknown>)
            : {}
    const parts = [
        value.error,
        value.message,
        value.detail,
        nested.error,
        nested.message,
        nested.detail
    ]
        .filter((item) => ['string', 'number'].includes(typeof item))
        .map(String)
    const errorCode = Number(value.error ?? nested.error ?? value.code)
    return { text: parts.join(' ').toLowerCase(), errorCode }
}

function registrationCategory(payload: unknown): PicaAccountCategory | null {
    const { text, errorCode } = providerSignals(payload)
    const username = /(email|user\s*name|username|account)/i.test(text)
    const invalid = /(validation|invalid|format|length|required|missing|must be)/i.test(
        text
    )
    if (
        username &&
        /(already|exist|exists|taken|registered|duplicate|duplicated)/i.test(text)
    )
        return 'USERNAME_TAKEN'
    if (/birthday|birth date|date of birth|age/i.test(text))
        return 'INVALID_BIRTHDAY'
    if (username && invalid) return 'INVALID_USERNAME'
    if (/password|passwd/i.test(text) && invalid) return 'INVALID_PASSWORD'
    if (/(nickname|display name)/i.test(text) && invalid) return 'INVALID_NICKNAME'
    if (/(question|answer|security|recovery)/i.test(text) && invalid)
        return 'INVALID_RECOVERY'
    if (errorCode === 1002 || invalid) return 'VALIDATION'
    return null
}

export function accountHttpError(
    status?: number,
    payload?: unknown,
    action: 'login' | 'register' = 'login'
) {
    if (!status) return new PicaAccountError('NETWORK')
    if (status === 429) return new PicaAccountError('RATE_LIMIT', status)
    if (status >= 500) return new PicaAccountError('UNAVAILABLE', status)
    if (action === 'register') {
        const category = registrationCategory(payload)
        if (category) return new PicaAccountError(category, status)
        if (status === 409) return new PicaAccountError('USERNAME_TAKEN', status)
    }
    return new PicaAccountError('REJECTED', status)
}
