# Pica Library Theme Template v1

普通用户通常不需要手工编辑这个目录。推荐流程：

1. 在 Pica Library Desktop/Web → **个性化装扮** 中填写一句主题描述。
2. 上传 1 张角色/吉祥物参考图；可额外上传少量风格参考图。
3. 点击 **导出给 AI**，得到 Theme Creator Kit ZIP。
4. 把 ZIP 直接交给支持图片与文件生成的 AI，并让它按包内说明执行。
5. AI 应返回一个完成的 `.pica-theme`（本质是 ZIP）。
6. 把 AI 返回的文件拖回 Desktop/Web，校验通过后即可立即应用，并可同步到已配对的 Android。

如果需要手工制作，包根目录包含：

- `manifest.json`
- `palette.json`
- `layout.json`
- `components.json`
- `assets/` 下的 PNG/JPG/JPEG/WebP

标准 AI 主题建议提供 9 个素材：主吉祥物、小头像、推荐加载图、空状态图、书库/推荐/在线/连接 4 个导航图标，以及低对比度背景花纹。

详细安全与字段合同见 `docs/THEME_PACK_SPEC_V1.md`；固定 AI 指令见 `docs/THEME_PACK_CREATOR_PROMPT.md`。