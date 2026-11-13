export interface GuideProgress { completedVersion: number; dismissedVersion: number; position: number }
export interface GuideState { autoShow: boolean; completedVersion: number; dismissedVersion: number; daily: GuideProgress; chapters: Record<string, GuideProgress> }
export const GUIDE_VERSION: number
export const ADVANCED_CHAPTER_IDS: string[]
export function normalizeGuideState(value?: unknown): GuideState
export function updateGuideProgress(value: unknown, track: string, chapter: string | null, patch: Partial<GuideProgress>): GuideState
export function shouldPromptDaily(value: unknown, sessionDismissed?: boolean): boolean
