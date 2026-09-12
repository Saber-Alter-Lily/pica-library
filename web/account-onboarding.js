/** Registration stays in memory and is sent only to the local Desktop controller. */
export function installAccountOnboarding({ post, getDesktop, getLanguage }) {
    const text = (zh, en) => (getLanguage() === 'en' ? en : zh)
    const element = (tag, value) => {
        const node = document.createElement(tag)
        if (value) node.textContent = value
        return node
    }
    function renderGuides() {
        for (const prefix of ['setup', 'settings']) {
            const form = document.getElementById(`${prefix}-form`)
            if (!form) continue
            form.querySelector('.account-onboarding-guide')?.remove()
            const guide = element('article')
            guide.className = 'wide notice panel account-onboarding-guide'
            guide.append(
                element('h3', text('第一次使用 Pica？', 'New to Pica?'))
            )
            guide.append(
                element(
                    'p',
                    text(
                        '已有账号：填写你在哔咔使用的账号标识和密码，不是 GitHub 账号，也不是昵称。原账号不一定是邮箱。先测试连接，再保存。',
                        'Have an account? Use your existing Pica account identifier and password, not your GitHub account or nickname. An existing identifier need not be an email. Test the connection before saving.'
                    )
                )
            )
            guide.append(
                element(
                    'p',
                    text(
                        '没有账号：可在这里注册第三方 Pica 账号。网络超时请检查代理；注册不等于账号已获评论等额外权限。',
                        'No account? Register with the third-party Pica service here. For timeouts, check your network/proxy. Registration does not guarantee additional privileges such as commenting.'
                    )
                )
            )
            const register = element(
                'button',
                text('没有账号？注册 Pica', 'Create a Pica account')
            )
            register.type = 'button'
            register.onclick = () => openRegistration(prefix)
            guide.append(register)
            guide.append(
                element(
                    'p',
                    text(
                        '暂不登录也可使用 Browser Lite 导入数据包；手机本地 / 局域网 / WebDAV 阅读不要求 Pica 账号。Pica 账号只用于在线服务。',
                        'Pica login is only needed for Pica online services. Browser Lite imports and Android local/LAN/WebDAV reading do not require it.'
                    )
                )
            )
            form.prepend(guide)
        }
    }
    renderGuides()
    document.addEventListener('pica-language-change', renderGuides)

    function openRegistration(prefix) {
        const dialog = element('dialog')
        dialog.className = 'account-registration-dialog'
        const form = element('form')
        form.className = 'account-registration-form'
        const heading = element(
            'h2',
            text('注册 Pica 账号', 'Register a Pica account')
        )
        heading.className = 'wide'
        form.append(heading)
        const close = element('button', text('返回登录', 'Back to login'))
        close.type = 'button'
        close.className = 'wide'
        close.onclick = () => dialog.close()
        form.append(close)
        const message = element('p')
        message.className = 'wide status'
        message.setAttribute('role', 'status')
        if (!getDesktop()) {
            message.textContent = text(
                'Browser Lite 不接收账号或密码。请打开本地 Windows 版或 Android 的 Pica 账号页面注册。',
                'Browser Lite does not collect credentials. Open Pica account settings in the local Windows or Android app to register.'
            )
            form.append(message)
            dialog.append(form)
            document.body.append(dialog)
            dialog.onclose = () => dialog.remove()
            dialog.showModal()
            return
        }
        const fields = {}
        function field(name, zh, en, type = 'text', max = 200) {
            const label = element('label', text(zh, en))
            const input = element('input')
            input.name = name
            input.type = type
            input.required = true
            input.maxLength = max
            input.autocomplete = type === 'password' ? 'new-password' : 'off'
            label.append(input)
            form.append(label)
            fields[name] = input
        }
        field(
            'name',
            '昵称（2–50 字）',
            'Nickname (2–50 characters)',
            'text',
            50
        )
        field('email', '新账号标识', 'New account identifier', 'text', 254)
        field(
            'password',
            '密码（至少 9 位）',
            'Password (at least 9 characters)',
            'password',
            128
        )
        field(
            'confirmPassword',
            '确认密码',
            'Confirm password',
            'password',
            128
        )
        field(
            'birthday',
            '真实出生日期（须年满 18 岁）',
            'Date of birth (18+ required)',
            'date'
        )
        const genderLabel = element('label', text('性别选项', 'Gender'))
        const gender = element('select')
        for (const [value, zh, en] of [
            ['', '请选择', 'Choose'],
            ['m', '男', 'Male'],
            ['f', '女', 'Female'],
            ['bot', '其他', 'Other']
        ]) {
            const option = element('option', text(zh, en))
            option.value = value
            gender.append(option)
        }
        gender.required = true
        fields.gender = gender
        genderLabel.append(gender)
        form.append(genderLabel)
        for (let index = 1; index <= 3; index++) {
            field(
                `question${index}`,
                `安全问题 ${index}`,
                `Security question ${index}`
            )
            field(
                `answer${index}`,
                `安全答案 ${index}（自行妥善保管）`,
                `Answer ${index} (keep it safe)`,
                'password'
            )
        }
        const consent = element(
            'label',
            text(
                '我已年满 18 岁，了解这是第三方 Pica 服务，将遵守其条款，仅访问合法授权内容。注册资料直接发送至 Pica；安全答案不由 Pica Library 保存。',
                'I am at least 18 and understand this is the third-party Pica service. I will follow its terms and access only authorized content. Registration data goes to Pica; Pica Library does not save security answers.'
            )
        )
        consent.className = 'wide'
        consent.classList.add('registration-consent')
        const accepted = element('input')
        accepted.type = 'checkbox'
        accepted.required = true
        consent.prepend(accepted)
        form.append(consent)
        const submit = element(
            'button',
            text('确认并注册', 'Confirm registration')
        )
        submit.type = 'submit'
        submit.className = 'primary'
        form.append(submit, message)
        let submitted = false
        form.onsubmit = async (event) => {
            event.preventDefault()
            if (submitted || !form.reportValidity()) return
            if (fields.password.value !== fields.confirmPassword.value) {
                message.textContent = text(
                    '两次密码不一致',
                    'Passwords do not match'
                )
                return
            }
            submitted = true
            submit.disabled = true
            close.disabled = true
            message.textContent = text(
                '正在提交。请勿重复注册…',
                'Submitting. Do not submit again…'
            )
            const payload = Object.fromEntries(
                Object.entries(fields).map(([key, input]) => [key, input.value])
            )
            payload.acceptedTerms = accepted.checked
            payload.proxyUrl = document.getElementById(`${prefix}-proxy`)?.value
            try {
                const result = await post(
                    '/api/v1/desktop/register-account',
                    payload
                )
                if (result.registered !== true)
                    throw new Error(
                        text('注册结果尚未确认', 'Registration not confirmed')
                    )
                document.getElementById(`${prefix}-account`).value =
                    payload.email
                document.getElementById(`${prefix}-password`).value =
                    payload.password
                message.textContent = text(
                    '注册成功。返回登录后测试连接并保存；注册不会自动同步或下载。',
                    'Registered. Return to login, test and save. No automatic sync or download was started.'
                )
                for (const input of Object.values(fields)) input.value = ''
            } catch (error) {
                message.textContent = `${error.message} ${text('若连接中断，账号可能已创建，请先返回尝试登录。', 'If the connection was interrupted, the account may already exist. Try logging in first.')}`
            } finally {
                close.disabled = false
                // Deliberate one-shot form: a timed-out registration may have succeeded.
                for (const key of Object.keys(payload)) delete payload[key]
            }
        }
        dialog.oncancel = (event) => {
            if (close.disabled) event.preventDefault()
        }
        dialog.onclose = () => {
            form.reset()
            dialog.remove()
        }
        dialog.append(form)
        document.body.append(dialog)
        dialog.showModal()
    }
}
