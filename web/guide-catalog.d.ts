export interface GuideStep { view: string; selector: string; title: string; body: string; panel: string | null; disclosure: string | null }
export function guideCatalog(t: (zh: string, en: string, ja: string) => string): { daily: GuideStep[]; chapters: Array<{ id: string; title: string; steps: GuideStep[] }> }
