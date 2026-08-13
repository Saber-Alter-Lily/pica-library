import type { LibraryService } from '../library/service'

export function assertLibraryChangeAllowed(
    service: LibraryService,
    currentDirectory: string | undefined,
    nextDirectory: string
) {
    if (currentDirectory !== nextDirectory && service.hasActiveLocalDownloads())
        throw new Error(
            'Pause or finish active downloads before changing the Library folder.'
        )
}
