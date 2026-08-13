export const supportedLanguages = ['zh-CN', 'en']
export const languageStorageKey = 'pica-library-language'

export const translations = {
    en: {
        'app.subtitle':
            'Library organization, personal discovery and incremental downloads',
        'app.language': 'Interface language',
        'mode.detecting': 'Detecting mode',
        'mode.connected': 'Connected',
        'mode.lite': 'Browser Lite',
        'nav.home': 'Home',
        'nav.library': 'Library',
        'nav.discover': 'Discover',
        'nav.downloads': 'Downloads',
        'nav.maintenance': 'Maintenance',
        'nav.settings': 'Settings',
        'setup.title': 'Welcome to Pica Library',
        'setup.subtitle':
            'Complete this basic setup once. After that, just double-click the app to open your library.',
        'setup.account': 'Pica account',
        'setup.password': 'Pica password',
        'setup.folder': 'Library folder',
        'setup.chooseFolder': 'Choose Folder',
        'setup.profile': 'Download profile',
        'setup.advanced': 'Advanced',
        'setup.proxy': 'HTTP/HTTPS proxy (optional)',
        'setup.security':
            'Your account and password are used only to connect to the Pica service. The Windows version protects saved credentials for the current Windows user with DPAPI.',
        'action.testConnection': 'Test Connection',
        'action.saveContinue': 'Save and Continue',
        'profile.conservative': 'Conservative',
        'profile.balanced': 'Balanced',
        'profile.fast': 'Fast',
        'profile.custom': 'Custom',
        'home.title': 'Get started',
        'home.subtitle':
            'Use Browser Lite for quick viewing, or connect the local service to sync, search and download.',
        'home.clear': 'Clear local data',
        'home.import': 'Import favorites',
        'home.importHint': 'CSV or Bundle',
        'home.recommend': 'View recommendations',
        'home.recommendHint': 'Based on your favorites',
        'home.downloads': 'Manage downloads',
        'home.downloadsHint': 'Jobs, progress and retries',
        'home.modes': 'Two modes',
        'home.modesText':
            'Browser Lite stores imported data in this browser. Connected mode uses the local service to access the provider; account credentials are not written to exported Bundles.',
        'library.title': 'Library',
        'library.subtitle': 'Filter, review and select comics to download.',
        'library.import': 'Import Bundle',
        'library.sync': 'Sync Favorites',
        'library.filterText': 'Title or author',
        'library.filterTags': 'Tags, comma-separated',
        'library.latest': 'Recently updated',
        'library.likes': 'Likes',
        'library.views': 'Views',
        'library.titleSort': 'Title',
        'library.filter': 'Filter',
        'library.grid': 'Grid',
        'library.list': 'List',
        'library.queue': 'Add to downloads',
        'library.export': 'Export plan',
        'library.loadMore': 'Load more',
        'library.author': 'Author',
        'library.tags': 'Tags',
        'library.updated': 'Updated',
        'library.progress': 'Progress',
        'discover.recommendations': 'For you',
        'discover.search': 'Search',
        'discover.recommendSubtitle':
            'Recommendations based on your author, circle, tag and category preferences.',
        'discover.view': 'View recommendations',
        'discover.searchSubtitle':
            'Search by keyword and tags, then sort the results.',
        'discover.keyword': 'Keyword',
        'downloads.title': 'Downloads',
        'downloads.subtitle':
            'Local and GitHub jobs use the same persistent queue semantics.',
        'downloads.jobs': 'Jobs',
        'downloads.media': 'Media',
        'downloads.interval': 'Interval ms',
        'downloads.retries': 'Retries',
        'downloads.refresh': 'Refresh',
        'downloads.run': 'Run queue',
        'maintenance.updates': 'Updates',
        'maintenance.repair': 'Repair',
        'maintenance.authors': 'Author normalization',
        'maintenance.health': 'Health check',
        'maintenance.updateTitle': 'Check for updates',
        'maintenance.updateSubtitle':
            'By default, only comics with local download state are checked.',
        'maintenance.checkUpdates': 'Check download updates',
        'maintenance.repairTitle': 'Repair missing files',
        'maintenance.repairSubtitle':
            'Scan for missing files, empty files and failed records.',
        'maintenance.scan': 'Scan issues',
        'maintenance.authorSubtitle':
            'Automatic suggestions are candidates only; you decide whether names are merged.',
        'maintenance.pendingOnly': 'Show pending review only',
        'maintenance.healthSubtitle':
            'Check the current mode, data summary and service availability.',
        'maintenance.runHealth': 'Run check',
        'settings.title': 'Settings',
        'settings.subtitle': 'Manage this Windows installation.',
        'settings.account': 'Account',
        'settings.accountPlaceholder': 'Leave blank to keep current account',
        'settings.password': 'Change password',
        'settings.passwordPlaceholder': 'Enter a new password to update',
        'settings.folder': 'Library folder',
        'settings.profile': 'Download profile',
        'settings.advanced': 'Advanced proxy settings',
        'settings.proxy': 'HTTP/HTTPS proxy',
        'settings.proxyPlaceholder': 'Disabled',
        'settings.save': 'Save settings',
        'settings.openData': 'Open data folder',
        'settings.openLogs': 'Open log folder',
        'settings.exit': 'Exit Pica Library',
        'author.approve': 'Confirm',
        'author.separate': 'Keep separate',
        'author.research': 'Needs research',
        'status.QUEUED': 'Queued',
        'status.PREPARING': 'Preparing',
        'status.RUNNING': 'Downloading',
        'status.RETRY_WAIT': 'Waiting to retry',
        'status.PAUSED': 'Paused',
        'status.COMPLETED': 'Completed',
        'status.FAILED': 'Failed',
        'status.CANCELLED': 'Cancelled',
        'action.select': 'Select',
        'action.download': 'Download',
        'action.pause': 'Pause',
        'action.resume': 'Resume',
        'action.retry': 'Retry',
        'action.cancel': 'Cancel job',
        'common.unknown': 'Unknown',
        'common.unknownAuthor': 'Unknown author',
        'common.comics': 'Comics',
        'common.favorites': 'Favorites',
        'common.authors': 'Authors',
        'common.pendingAuthors': 'Authors pending review',
        'common.episodes': 'Episodes',
        'common.downloadedPictures': 'Downloaded pictures',
        'common.litePlans': 'Lite plans',
        'message.testing': 'Testing connection...',
        'message.connectionSuccess': 'Connection successful.',
        'message.savedOpening': 'Saved. Opening your library...',
        'message.savedRestarting': 'Saved. Restarting the local engine...',
        'message.settingsSaved': 'Settings saved.',
        'message.stopped': 'Pica Library has stopped.',
        'message.closeTab': 'You can close this tab.',
        'message.libraryCount': 'Showing {shown} of {total} comics',
        'message.recommendationCount': '{count} recommendations.',
        'message.emptyPlan': 'The download plan is empty.',
        'message.emptyQueue': 'The queue is empty.',
        'message.litePlan': 'Browser Lite plan',
        'message.retryCount': 'Retries: {count}',
        'message.imported':
            'Imported {records} records, {recommendations} recommendations and {plans} plans.',
        'message.syncNeedsEngine': 'Sync Favorites requires the local engine.',
        'message.searchNeedsEngine':
            'Provider search requires the local engine.',
        'message.searchCount': 'Found {count} results.',
        'message.recommendNeedsData':
            'Import a Bundle with recommendations or connect the local engine first.',
        'message.comicProgress':
            '{likes} likes · {downloaded}/{total} downloaded',
        'message.authorMeta':
            '{works} works · {aliases} · {confidence}% confidence',
        'message.popularity': '{likes} likes · {views} views',
        'message.bytes': '{count} bytes',
        'error.auth':
            'The account or password was rejected. Check them and try again.',
        'error.network':
            'Could not reach the Pica service. Check your network or proxy settings.',
        'error.proxy':
            'The proxy could not connect. Check the proxy address and try again.',
        'error.librarySwitch':
            'Active downloads are in progress. Pause or finish them before changing the Library folder.',
        'error.credential': 'Windows could not securely store the credentials.',
        'error.dataDirectory':
            'Pica Library could not create its data folder. Check that the location is writable.',
        'error.database':
            'Pica Library could not open the library database. Check the data folder and try again.',
        'error.browser':
            'Pica Library started, but the browser could not be opened automatically. Open the local address shown by the app in your browser.',
        'error.port':
            'The preferred local port is in use. Pica Library will try another loopback port.',
        'error.shutdown':
            'Pica Library could not shut down cleanly. Wait a moment and try Exit again.',
        'error.generic':
            'The operation could not be completed. Please try again.'
    },
    'zh-CN': {
        'app.subtitle': '收藏整理、个性发现与增量下载',
        'app.language': '界面语言',
        'mode.detecting': '正在检测模式',
        'mode.connected': '已连接',
        'mode.lite': 'Browser Lite',
        'nav.home': '首页',
        'nav.library': '漫画库',
        'nav.discover': '发现',
        'nav.downloads': '下载任务',
        'nav.maintenance': '库维护',
        'nav.settings': '设置',
        'setup.title': '欢迎使用 Pica Library',
        'setup.subtitle':
            '完成一次基础配置后，以后只需双击程序即可进入漫画库。',
        'setup.account': 'Pica 账号',
        'setup.password': 'Pica 密码',
        'setup.folder': '漫画保存目录',
        'setup.chooseFolder': '选择文件夹',
        'setup.profile': '下载模式',
        'setup.advanced': '高级设置',
        'setup.proxy': 'HTTP/HTTPS 代理（可选）',
        'setup.security':
            '账号和密码仅用于连接 Pica 服务。Windows 版本使用当前 Windows 用户的 DPAPI 加密保存凭据。',
        'action.testConnection': '测试连接',
        'action.saveContinue': '保存并开始使用',
        'profile.conservative': '保守',
        'profile.balanced': '均衡',
        'profile.fast': '快速',
        'profile.custom': '自定义',
        'home.title': '开始使用',
        'home.subtitle': '网页轻量查看，连接本地服务后可同步、搜索和下载。',
        'home.clear': '清空本地数据',
        'home.import': '导入收藏',
        'home.importHint': 'CSV 或数据包',
        'home.recommend': '查看推荐',
        'home.recommendHint': '基于收藏偏好',
        'home.downloads': '管理下载',
        'home.downloadsHint': '任务、进度与重试',
        'home.modes': '两种模式',
        'home.modesText':
            'Browser Lite 将导入的数据保存在当前浏览器；连接模式由本地服务访问站点，账号凭据不会写入导出数据包。',
        'library.title': '漫画库',
        'library.subtitle': '筛选、核对并选择需要下载的作品。',
        'library.import': '导入数据包',
        'library.sync': '同步收藏',
        'library.filterText': '标题或作者',
        'library.filterTags': '标签，逗号分隔',
        'library.latest': '最近更新',
        'library.likes': '爱心数量',
        'library.views': '浏览数量',
        'library.titleSort': '标题',
        'library.filter': '筛选',
        'library.grid': '网格',
        'library.list': '列表',
        'library.queue': '加入下载',
        'library.export': '导出计划',
        'library.loadMore': '加载更多',
        'library.author': '作者',
        'library.tags': '标签',
        'library.updated': '更新',
        'library.progress': '进度',
        'discover.recommendations': '为你推荐',
        'discover.search': '搜索',
        'discover.recommendSubtitle':
            '根据作者、社团、标签和分类偏好生成推荐。',
        'discover.view': '查看推荐',
        'discover.searchSubtitle': '按关键词和标签查找并排序。',
        'discover.keyword': '关键词',
        'downloads.title': '下载任务',
        'downloads.subtitle': '本地与 GitHub 任务使用同一套持久化队列。',
        'downloads.jobs': '任务数',
        'downloads.media': '图片并发',
        'downloads.interval': '请求间隔（毫秒）',
        'downloads.retries': '重试次数',
        'downloads.refresh': '刷新',
        'downloads.run': '运行队列',
        'maintenance.updates': '更新',
        'maintenance.repair': '修复',
        'maintenance.authors': '作者归一',
        'maintenance.health': '健康检查',
        'maintenance.updateTitle': '检查更新',
        'maintenance.updateSubtitle': '默认只检查已经建立本地下载状态的漫画。',
        'maintenance.checkUpdates': '检查下载内容更新',
        'maintenance.repairTitle': '修复缺失文件',
        'maintenance.repairSubtitle': '扫描缺失文件、空文件和失败记录。',
        'maintenance.scan': '扫描问题',
        'maintenance.authorSubtitle': '自动建议仅作为候选，是否合并由你确认。',
        'maintenance.pendingOnly': '仅看待审核',
        'maintenance.healthSubtitle': '确认当前模式、数据统计和服务可用性。',
        'maintenance.runHealth': '运行检查',
        'settings.title': '设置',
        'settings.subtitle': '管理当前 Windows 安装。',
        'settings.account': '账户',
        'settings.accountPlaceholder': '留空则保留当前账号',
        'settings.password': '修改密码',
        'settings.passwordPlaceholder': '输入新密码以更新',
        'settings.folder': '漫画保存目录',
        'settings.profile': '下载模式',
        'settings.advanced': '高级代理设置',
        'settings.proxy': 'HTTP/HTTPS 代理',
        'settings.proxyPlaceholder': '未启用',
        'settings.save': '保存设置',
        'settings.openData': '打开数据目录',
        'settings.openLogs': '打开日志目录',
        'settings.exit': '退出 Pica Library',
        'author.approve': '确认',
        'author.separate': '保持分离',
        'author.research': '待研究',
        'status.QUEUED': '等待中',
        'status.PREPARING': '准备中',
        'status.RUNNING': '下载中',
        'status.RETRY_WAIT': '等待重试',
        'status.PAUSED': '已暂停',
        'status.COMPLETED': '已完成',
        'status.FAILED': '失败',
        'status.CANCELLED': '已取消',
        'action.select': '选择',
        'action.download': '下载',
        'action.pause': '暂停',
        'action.resume': '继续',
        'action.retry': '重试',
        'action.cancel': '取消任务',
        'common.unknown': '未知',
        'common.unknownAuthor': '未知作者',
        'common.comics': '漫画',
        'common.favorites': '收藏',
        'common.authors': '作者',
        'common.pendingAuthors': '待审核作者',
        'common.episodes': '章节',
        'common.downloadedPictures': '已下载图片',
        'common.litePlans': 'Lite 计划',
        'message.testing': '正在测试连接…',
        'message.connectionSuccess': '连接成功。',
        'message.savedOpening': '已保存，正在打开漫画库…',
        'message.savedRestarting': '已保存，正在重启本地服务…',
        'message.settingsSaved': '设置已保存。',
        'message.stopped': 'Pica Library 已退出。',
        'message.closeTab': '现在可以关闭此页面。',
        'message.libraryCount': '已显示 {shown} / {total} 部作品',
        'message.recommendationCount': '共 {count} 条推荐。',
        'message.emptyPlan': '下载计划为空。',
        'message.emptyQueue': '下载队列为空。',
        'message.litePlan': 'Browser Lite 计划',
        'message.retryCount': '重试 {count} 次',
        'message.imported':
            '已导入 {records} 条记录、{recommendations} 条推荐和 {plans} 个计划。',
        'message.syncNeedsEngine': '同步收藏需要连接本地服务。',
        'message.searchNeedsEngine': '站内搜索需要连接本地服务。',
        'message.searchCount': '找到 {count} 条结果。',
        'message.recommendNeedsData':
            '请先导入包含推荐结果的数据包，或连接本地服务。',
        'message.comicProgress': '爱心 {likes} · 已下载 {downloaded}/{total}',
        'message.authorMeta':
            '{works} 部作品 · {aliases} · 置信度 {confidence}%',
        'message.popularity': '爱心 {likes} · 浏览 {views}',
        'message.bytes': '{count} 字节',
        'error.auth': '账号或密码验证失败，请检查后重试。',
        'error.network': '无法连接到 Pica 服务，请检查网络连接或代理设置。',
        'error.proxy': '代理连接失败，请检查代理地址后重试。',
        'error.librarySwitch':
            '当前有正在进行的下载任务。请先暂停或完成下载后再更改漫画保存目录。',
        'error.credential': 'Windows 无法安全保存凭据。',
        'error.dataDirectory':
            '无法创建 Pica Library 数据目录，请确认该位置可写。',
        'error.database': '无法打开漫画库数据库，请检查数据目录后重试。',
        'error.browser':
            'Pica Library 已启动，但未能自动打开浏览器。请在浏览器中打开程序显示的本地地址。',
        'error.port': '首选本地端口已被占用，Pica Library 将尝试其他回环端口。',
        'error.shutdown': 'Pica Library 未能正常退出，请稍候再尝试退出。',
        'error.generic': '操作未能完成，请重试。'
    }
}

export function normalizeLanguage(value) {
    const language = String(value || '').toLowerCase()
    return language === 'zh' ||
        language.startsWith('zh-cn') ||
        language.startsWith('zh-hans') ||
        language.startsWith('zh-sg')
        ? 'zh-CN'
        : 'en'
}

export function detectLanguage(languages = []) {
    return normalizeLanguage(
        Array.isArray(languages) ? languages[0] : languages
    )
}

export function resolveLanguage(storage, languages) {
    const saved = storage?.getItem?.(languageStorageKey)
    return supportedLanguages.includes(saved)
        ? saved
        : detectLanguage(languages)
}

export function saveLanguage(storage, language) {
    const normalized = supportedLanguages.includes(language) ? language : 'en'
    storage?.setItem?.(languageStorageKey, normalized)
    return normalized
}

export function translate(language, key, values = {}) {
    const template = translations[language]?.[key] ?? translations.en[key] ?? ''
    return template.replace(/\{(\w+)\}/g, (_, name) =>
        String(values[name] ?? '')
    )
}

export function missingTranslationKeys(language) {
    return Object.keys(translations.en).filter(
        (key) => !translations[language]?.[key]
    )
}

export function localizeError(language, error) {
    const message = error instanceof Error ? error.message : String(error || '')
    if (/account|password|credential|401|unauthor|rejected/i.test(message))
        return translate(language, 'error.auth')
    if (/proxy/i.test(message)) return translate(language, 'error.proxy')
    if (/pause or finish active downloads/i.test(message))
        return translate(language, 'error.librarySwitch')
    if (/credential protection|securely store|dpapi/i.test(message))
        return translate(language, 'error.credential')
    if (/create.*data directory|data directory.*writ/i.test(message))
        return translate(language, 'error.dataDirectory')
    if (/database.*open|open.*database|sqlite.*open/i.test(message))
        return translate(language, 'error.database')
    if (/browser.*(?:launch|open)|(?:launch|open).*browser/i.test(message))
        return translate(language, 'error.browser')
    if (/port.*(?:conflict|in use|occupied)|eaddrinuse/i.test(message))
        return translate(language, 'error.port')
    if (/shutdown|shut down|failed to stop/i.test(message))
        return translate(language, 'error.shutdown')
    if (
        /network|timeout|socket|connect|dns|tls|provider could not be reached/i.test(
            message
        )
    )
        return translate(language, 'error.network')
    return message || translate(language, 'error.generic')
}

export const domTranslations = [
    ['.app-header > div > p', 'app.subtitle'],
    ['.language-control span', 'app.language'],
    ['#mode', 'mode.detecting'],
    ['[data-view="home"]', 'nav.home'],
    ['[data-view="library"]', 'nav.library'],
    ['[data-view="discover"]', 'nav.discover'],
    ['[data-view="downloads"]', 'nav.downloads'],
    ['[data-view="maintenance"]', 'nav.maintenance'],
    ['#settings-nav', 'nav.settings'],
    ['#setup .setup-heading h2', 'setup.title'],
    ['#setup .setup-heading p', 'setup.subtitle'],
    ['#setup-account', 'setup.account', 'data-label'],
    ['#setup-password', 'setup.password', 'data-label'],
    ['#setup-directory', 'setup.folder', 'data-label'],
    ['#setup-folder', 'setup.chooseFolder'],
    ['#setup-profile', 'setup.profile', 'data-label'],
    ['#setup-profile option[value="conservative"]', 'profile.conservative'],
    ['#setup-profile option[value="balanced"]', 'profile.balanced'],
    ['#setup-profile option[value="fast"]', 'profile.fast'],
    ['#setup details summary', 'setup.advanced'],
    ['#setup-proxy', 'setup.proxy', 'data-label'],
    ['#setup-security', 'setup.security'],
    ['#setup-test', 'action.testConnection'],
    ['#setup-form button[type="submit"]', 'action.saveContinue'],
    ['#home h2', 'home.title'],
    ['#home .page-heading p', 'home.subtitle'],
    ['#clear-lite-state', 'home.clear'],
    ['[data-go="library"] strong', 'home.import'],
    ['[data-go="library"] span', 'home.importHint'],
    ['[data-go="discover"] strong', 'home.recommend'],
    ['[data-go="discover"] span', 'home.recommendHint'],
    ['[data-go="downloads"] strong', 'home.downloads'],
    ['[data-go="downloads"] span', 'home.downloadsHint'],
    ['#home .notice strong', 'home.modes'],
    ['#home .notice p', 'home.modesText'],
    ['#library h2', 'library.title'],
    ['#library .page-heading p', 'library.subtitle'],
    ['#import-button', 'library.import'],
    ['#sync-button', 'library.sync'],
    ['#filter-text', 'library.filterText', 'placeholder'],
    ['#filter-tag', 'library.filterTags', 'placeholder'],
    ['#sort-mode option[value="latest"]', 'library.latest'],
    ['#sort-mode option[value="likes"]', 'library.likes'],
    ['#sort-mode option[value="views"]', 'library.views'],
    ['#sort-mode option[value="title"]', 'library.titleSort'],
    ['#apply-filter', 'library.filter'],
    ['#view-grid', 'library.grid'],
    ['#view-list', 'library.list'],
    ['#queue-selected', 'library.queue'],
    ['#export-plan', 'library.export'],
    ['#load-more', 'library.loadMore'],
    ['#comic-table th:nth-child(2)', 'library.titleSort'],
    ['#comic-table th:nth-child(3)', 'library.author'],
    ['#comic-table th:nth-child(4)', 'library.tags'],
    ['#comic-table th:nth-child(5)', 'library.likes'],
    ['#comic-table th:nth-child(6)', 'library.updated'],
    ['#comic-table th:nth-child(7)', 'library.progress'],
    ['[data-tab="recommend"]', 'discover.recommendations'],
    ['[data-tab="search"]', 'discover.search'],
    ['#recommend h2', 'discover.recommendations'],
    ['#recommend .page-heading p', 'discover.recommendSubtitle'],
    ['#recommend-button', 'discover.view'],
    ['#search h2', 'discover.search'],
    ['#search .page-heading p', 'discover.searchSubtitle'],
    ['#search-keyword', 'discover.keyword', 'placeholder'],
    ['#search-tags', 'library.filterTags', 'placeholder'],
    ['#search-button', 'discover.search'],
    ['#downloads h2', 'downloads.title'],
    ['#downloads .page-heading p', 'downloads.subtitle'],
    [
        '#performance-profile option[value="conservative"]',
        'profile.conservative'
    ],
    ['#performance-profile option[value="balanced"]', 'profile.balanced'],
    ['#performance-profile option[value="fast"]', 'profile.fast'],
    ['#performance-profile option[value="custom"]', 'profile.custom'],
    ['#custom-jobs', 'downloads.jobs', 'data-label'],
    ['#custom-media', 'downloads.media', 'data-label'],
    ['#custom-interval', 'downloads.interval', 'data-label'],
    ['#custom-retries', 'downloads.retries', 'data-label'],
    ['#refresh-jobs', 'downloads.refresh'],
    ['#run-jobs', 'downloads.run'],
    ['#maintenance [data-tab="updates"]', 'maintenance.updates'],
    ['#maintenance [data-tab="repair"]', 'maintenance.repair'],
    ['#maintenance [data-tab="authors"]', 'maintenance.authors'],
    ['#maintenance [data-tab="health"]', 'maintenance.health'],
    ['#updates h2', 'maintenance.updateTitle'],
    ['#updates p', 'maintenance.updateSubtitle'],
    ['#check-updates', 'maintenance.checkUpdates'],
    ['#repair h2', 'maintenance.repairTitle'],
    ['#repair p', 'maintenance.repairSubtitle'],
    ['#scan-repair', 'maintenance.scan'],
    ['#authors h2', 'maintenance.authors'],
    ['#authors .page-heading p', 'maintenance.authorSubtitle'],
    ['#pending-only', 'maintenance.pendingOnly', 'data-label'],
    ['#health h2', 'maintenance.health'],
    ['#health p', 'maintenance.healthSubtitle'],
    ['#run-health', 'maintenance.runHealth'],
    ['#settings h2', 'settings.title'],
    ['#settings .page-heading p', 'settings.subtitle'],
    ['#settings-account', 'settings.account', 'data-label'],
    ['#settings-account', 'settings.accountPlaceholder', 'placeholder'],
    ['#settings-password', 'settings.password', 'data-label'],
    ['#settings-password', 'settings.passwordPlaceholder', 'placeholder'],
    ['#settings-directory', 'settings.folder', 'data-label'],
    ['#settings-folder', 'setup.chooseFolder'],
    ['#settings-profile', 'settings.profile', 'data-label'],
    ['#settings-profile option[value="conservative"]', 'profile.conservative'],
    ['#settings-profile option[value="balanced"]', 'profile.balanced'],
    ['#settings-profile option[value="fast"]', 'profile.fast'],
    ['#settings details summary', 'settings.advanced'],
    ['#settings-proxy', 'settings.proxy', 'data-label'],
    ['#settings-proxy', 'settings.proxyPlaceholder', 'placeholder'],
    ['#settings-test', 'action.testConnection'],
    ['#settings-form button[type="submit"]', 'settings.save'],
    ['#open-data', 'settings.openData'],
    ['#open-logs', 'settings.openLogs'],
    ['#exit-app', 'settings.exit'],
    ['[data-decision="approved"]', 'author.approve'],
    ['[data-decision="keep_separate"]', 'author.separate'],
    ['[data-decision="needs_research"]', 'author.research']
]

function labelFor(input) {
    const label = input.closest('label')
    if (!label) return
    let text = label.firstChild
    if (!text || text.nodeType !== 3) {
        text = document.createTextNode('')
        label.prepend(text)
    }
    return text
}

export function applyTranslations(language, root = document) {
    root.documentElement?.setAttribute('lang', language)
    for (const [selector, key, attribute] of domTranslations) {
        for (const element of root.querySelectorAll(selector)) {
            const value = translate(language, key)
            if (attribute === 'data-label') {
                const text = labelFor(element)
                if (text) text.textContent = value
            } else if (attribute) element.setAttribute(attribute, value)
            else element.textContent = value
        }
    }
}
