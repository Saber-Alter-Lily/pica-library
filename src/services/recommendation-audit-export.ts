import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import {
    buildRecommendationAuditBundleV5,
    type RecommendationAuditExportReadPortV5
} from '../recommendation/audit-export-v5'

/** Reuse the application's existing ZIP library and native picker; no new exporter framework. */
export function serializeRecommendationAuditV5(
    bundle: ReturnType<typeof buildRecommendationAuditBundleV5>
) {
    const zip = new AdmZip()
    for (const entry of bundle.jsonEntries)
        zip.addFile(
            entry.name,
            Buffer.from(JSON.stringify(entry.value, null, 2), 'utf8')
        )
    zip.addFile('README.txt', Buffer.from(bundle.readme, 'utf8'))
    return zip.toBuffer()
}

export async function exportRecommendationAuditV5(options: {
    read: RecommendationAuditExportReadPortV5
    productVersion: string
    sourceSha?: string | null
    appSessionId?: unknown
    choosePath(generatedAt: string): Promise<string | null>
    now?: () => Date
}) {
    const generatedAt = (options.now?.() ?? new Date()).toISOString()
    // Cancel before reading policy/events or computing optional Visual/evaluation reports.
    const file = await options.choosePath(generatedAt)
    if (!file) return { success: false, cancelled: true }
    const bundle = buildRecommendationAuditBundleV5(options.read, {
        generatedAt,
        productVersion: options.productVersion,
        sourceSha: options.sourceSha ?? null,
        appSessionId: String(options.appSessionId ?? '').trim() || null
    })
    const buffer = serializeRecommendationAuditV5(bundle)
    fs.writeFileSync(file, buffer)
    return {
        success: true,
        fileName: path.basename(file),
        generatedAt,
        sizeBytes: buffer.byteLength,
        sha256: createHash('sha256').update(buffer).digest('hex')
    }
}
