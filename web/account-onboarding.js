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
                        '没有账号：可在这里注册第三方 Pica 账号。注册本身不强制使用代理；如果提示无法连接 Pica API，说明当前网络直连失败，请开启系统代理/加速器或配置 HTTP/HTTPS 代理。',
                        'No account? Register with the third-party Pica service here. Registration does not inherently require a proxy. If the Pica API cannot be reached directly on this network, enable your system proxy/VPN or configure an HTTP/HTTPS proxy.'
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
        fields.name.minLength = 2
        field(
            'email',
            '用户名（1–16 位字母 / 数字 / . / _）',
            'Username (1–16 letters, digits, . or _)',
            'text',
            16
        )
        fields.email.pattern = '[A-Za-z0-9._]{1,16}'
        field(
            'password',
            '密码（至少 9 位）',
            'Password (at least 9 characters)',
            'password',
            128
        )
        fields.password.minLength = 9
        field(
            'confirmPassword',
            '确认密码',
            'Confirm password',
            'password',
            128
        )
        fields.confirmPassword.minLength = 9
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
                message.textContent = text(
                    '注册成功。用户名已带回登录表单；请自行输入刚才设置的密码，测试连接并保存。',
                    'Registered. The username was copied back to the login form; enter the password you just created, test the connection, and save.'
                )
                for (const input of Object.values(fields)) input.value = ''
                accepted.checked = false
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                message.textContent = `${text('注册失败：', 'Registration failed: ')}${reason}`
                const uncertain = /无法连接 Pica API|响应异常|尚未确认|not confirmed|network|timeout/i.test(reason)
                if (!uncertain) {
                    submitted = false
                    submit.disabled = false
                } else {
                    message.textContent += text(
                        ' 本次结果可能无法确认，请先返回登录尝试，不要立即重复注册。',
                        ' The result may be uncertain; try logging in before registering again.'
                    )
                }
            } finally {
                close.disabled = false
                // Registration values stay only in the live form; the request copy is erased.
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
