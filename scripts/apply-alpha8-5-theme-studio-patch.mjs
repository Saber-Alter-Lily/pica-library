import fs from 'node:fs'

function replaceOnce(file, before, after) {
    const source = fs.readFileSync(file, 'utf8')
    if (source.includes(after)) return
    const first = source.indexOf(before)
    if (first < 0)
        throw new Error(
            `Alpha8.5 theme patch anchor missing in ${file}: ${before.slice(0, 140)}`
        )
    if (source.indexOf(before, first + before.length) >= 0)
        throw new Error(`Alpha8.5 theme patch anchor not unique in ${file}`)
    fs.writeFileSync(
        file,
        source.slice(0, first) + after + source.slice(first + before.length),
        'utf8'
    )
}

replaceOnce(
    'src/desktop/main.ts',
    `const personalization = new PersonalizationService(
    path.join(paths.runtimeState, 'personalization')
)`,
    `const personalization = new PersonalizationService(
    path.join(paths.runtimeState, 'personalization'),
    path.join(applicationRoot, 'web')
)
if (['0.3.2', '0.3.3'].includes(PRODUCT_VERSION)) {
    try { personalization.installBundledTesterGrant() } catch { /* tester access never blocks startup */ }
}`
)

replaceOnce(
    'src/library/server.ts',
    `    status: () => Record<string, unknown>
    save: (input: Record<string, unknown>) => Promise<Record<string, unknown>>`,
    `    status: () => Record<string, unknown>
    importThemePack?: (name: string, value: Buffer) => Promise<Record<string, unknown>>
    save: (input: Record<string, unknown>) => Promise<Record<string, unknown>>`
)

replaceOnce(
    'src/library/server.ts',
    `            if (
                url.pathname === '/api/v1/desktop/settings' &&
                request.method === 'POST' &&
                options.desktop
            ) {`,
    `            if (
                url.pathname === '/api/v1/desktop/theme-import' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.importThemePack)
                    throw new Error('Theme import is unavailable in this mode')
                const rawName = String(request.headers['x-theme-filename'] ?? 'theme.pica-theme')
                let decodedName = rawName
                try { decodedName = decodeURIComponent(rawName) } catch { /* basename below still constrains it */ }
                const filename = path.basename(decodedName)
                return json(
                    response,
                    200,
                    await options.desktop.importThemePack(
                        filename,
                        await binaryBody(request, 24 * 1024 * 1024)
                    )
                )
            }
            if (
                url.pathname === '/api/v1/desktop/settings' &&
                request.method === 'POST' &&
                options.desktop
            ) {`
)

replaceOnce(
    'src/desktop/main.ts',
    `        save: async (input) => {
            const remoteAction = String(input.remoteStorageAction ?? '')`,
    `        importThemePack: async (name, value) => {
            const themePack = personalization.importThemePack(name, value)
            personalization.activateThemePack(themePack.id)
            return {
                success: true,
                themePack,
                personalization: {
                    ...personalization.status(),
                    themePacks: personalization.listThemePacks()
                }
            }
        },
        save: async (input) => {
            const themeAction = String(input.personalizationAction ?? '')
            if (themeAction === 'export-theme-creator-kit') {
                const kit = personalization.createThemeCreatorKit({
                    description: input.description,
                    references: input.references
                })
                return {
                    success: true,
                    fileName: kit.fileName,
                    size: kit.size,
                    references: kit.references,
                    dataBase64: kit.buffer.toString('base64')
                }
            }
            if (themeAction === 'activate-theme') {
                return {
                    success: true,
                    personalization: personalization.activateThemePack(String(input.themeId ?? ''))
                }
            }
            if (themeAction === 'deactivate-theme') {
                return {
                    success: true,
                    personalization: personalization.deactivateThemePack()
                }
            }
            if (themeAction === 'theme-descriptor') {
                return {
                    success: true,
                    theme: personalization.themeDescriptor(String(input.themeId ?? ''))
                }
            }
            const remoteAction = String(input.remoteStorageAction ?? '')`
)

replaceOnce(
    'src/library/service.ts',
    `    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }

    recordRecommendationEvent(input: UserEventInput) {`,
    `    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }
    private recommendationProgress = { state: 'idle', phase: 'idle', done: 0, total: 6 }

    recommendationBuildProgress() { return { ...this.recommendationProgress } }

    recordRecommendationEvent(input: UserEventInput) {`
)

replaceOnce(
    'src/library/service.ts',
    `    async buildFinalRecommendationCycleV3(cycleId: string) {
        const pica = await this.connect()
        const catalog = this.database.listComics({ limit: 10000 })`,
    `    async buildFinalRecommendationCycleV3(cycleId: string) {
        this.recommendationProgress = { state: 'running', phase: 'profile', done: 0, total: 6 }
        const pica = await this.connect()
        const catalog = this.database.listComics({ limit: 10000 })`
)

replaceOnce(
    'src/library/service.ts',
    `        const profile = buildFinalLifetimeProfileV3(catalog, { registry })
        const history: IntentCycleHistory[]`,
    `        const profile = buildFinalLifetimeProfileV3(catalog, { registry })
        this.recommendationProgress = { state: 'running', phase: 'intents', done: 1, total: 6 }
        const history: IntentCycleHistory[]`
)

replaceOnce(
    'src/library/service.ts',
    `        const intents = buildRecommendationIntentsV3({
            profile,
            favorites,
            history
        })
        const routes = translateIntentPlanV3(intents)`,
    `        const intents = buildRecommendationIntentsV3({
            profile,
            favorites,
            history
        })
        this.recommendationProgress = { state: 'running', phase: 'routes', done: 2, total: 6 }
        const routes = translateIntentPlanV3(intents)`
)

replaceOnce(
    'src/library/service.ts',
    `        const retrieved = await retrieveCandidatesV3({`,
    `        this.recommendationProgress = { state: 'running', phase: 'retrieve', done: 3, total: 6 }
        const retrieved = await retrieveCandidatesV3({`
)

replaceOnce(
    'src/library/service.ts',
    `        const ranked = rankCandidatesWithFrozenRankerV3({`,
    `        this.recommendationProgress = { state: 'running', phase: 'rank', done: 4, total: 6 }
        const ranked = rankCandidatesWithFrozenRankerV3({`
)

replaceOnce(
    'src/library/service.ts',
    `        return {
            profile,
            intents,`,
    `        this.recommendationProgress = { state: 'complete', phase: 'complete', done: 6, total: 6 }
        return {
            profile,
            intents,`
)

replaceOnce(
    'src/library/server.ts',
    `                        : url.searchParams.get('mode') === 'final'
                          ? finalRecommendationCoordinator.status()
                          : adaptiveRecommendationService.status()`,
    `                        : url.searchParams.get('mode') === 'final'
                          ? {
                                ...finalRecommendationCoordinator.status(),
                                buildProgress: options.service.recommendationBuildProgress()
                            }
                          : adaptiveRecommendationService.status()`
)

replaceOnce(
    'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java',
    `    private Button navButton(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setTextSize(13.5f);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setBackgroundColor(Color.TRANSPARENT);b.setMinHeight(Ui.dp(this,48));b.setOnClickListener(action);return b;}`,
    `    private Button navButton(String label,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setTextSize(12.5f);b.setAllCaps(false);b.setTextColor(Ui.PRIMARY);b.setBackgroundColor(Color.TRANSPARENT);b.setMinHeight(Ui.dp(this,48));b.setGravity(Gravity.CENTER);android.graphics.drawable.Drawable icon=ThemePackStore.navDrawable(this,label);if(icon!=null){int size=Ui.dp(this,20);icon.setBounds(0,0,size,size);b.setCompoundDrawables(null,icon,null,null);b.setCompoundDrawablePadding(Ui.dp(this,1));}String typography=ThemePackStore.navigationTypography(this);if("comic".equals(typography)||"cute".equals(typography))b.setTypeface(android.graphics.Typeface.DEFAULT,android.graphics.Typeface.BOLD);b.setOnClickListener(action);return b;}`
)

console.log('Alpha8.5 Theme Studio integration patch applied')
