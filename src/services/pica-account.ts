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
        throw new Error('请填写有效的出生日期')
    const today = now.toISOString().slice(0, 10)
    const age =
        Number(today.slice(0, 4)) -
        date.getUTCFullYear() -
        (today.slice(5) < birthday.slice(5) ? 1 : 0)
    if (age < 18) throw new Error('此服务仅限年满 18 岁的用户注册')
    if (!['m', 'f', 'bot'].includes(String(input.gender)))
        throw new Error('请选择性别选项')
    const password = text('password', 9, 128, false)
    if (input.confirmPassword !== password)
        throw new Error('两次输入的密码不一致')
    return {
        name: text('name', 2, 50),
        // The provider calls this field email; existing identifiers need not contain @.
        email: text('email', 1, 254),
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

export class PicaAccountError extends Error {
    constructor(
        readonly category: string,
        readonly httpStatus?: number
    ) {
        const messages: Record<string, string> = {
            NETWORK: '无法连接 Pica，请检查网络和代理。不要反复修改密码。',
            REJECTED:
                'Pica 拒绝了账号请求，请检查填写信息或在 Pica 客户端确认账号状态。',
            RATE_LIMIT: 'Pica 请求过于频繁，请稍后再试。',
            UNAVAILABLE: 'Pica 账号服务暂时不可用，请稍后再试。',
            RESPONSE:
                'Pica 账号响应异常，结果尚未确认。请先尝试登录，不要重复注册。'
        }
        super(messages[category] ?? messages.RESPONSE)
        this.name = 'PicaAccountError'
    }
}

export function accountHttpError(status?: number) {
    return new PicaAccountError(
        !status
            ? 'NETWORK'
            : status === 429
              ? 'RATE_LIMIT'
              : status >= 500
                ? 'UNAVAILABLE'
                : 'REJECTED',
        status
    )
}
