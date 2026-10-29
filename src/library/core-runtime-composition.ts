import type { LibraryDatabase } from './database'
import { LibraryQueryService } from '../services/library-query-service'
import { ShelfService } from '../services/shelf-service'
import { ReaderService, type ExternalFileOpener } from '../services/reader-service'
import { LocalLibraryIngestion } from '../local-library/ingestion'
import { CoreLocalImportController } from './core-local-import'

/**
 * Shared LOCAL business-service composition used by the original full Desktop
 * HTTP server and the standalone source-free Reader/Library runtime.
 *
 * Concrete ProviderService, Pica/E-H/JM SDKs, external Host processes, source
 * credentials and OS launch permissions NEVER enter this factory. The trusted
 * Desktop application may explicitly inject the existing local-file opener.
 * Without it, opening an external file fails closed in the original Reader.
 */
export interface CoreLocalRuntimeOptions {
    database: LibraryDatabase
    dataDir: string
    externalFileOpener?: ExternalFileOpener
}
export function createCoreLibraryPorts(database: LibraryDatabase) {
    const libraryQueries = new LibraryQueryService(database)
    const shelfService = new ShelfService(database, libraryQueries)
    return { libraryQueries, shelfService }
}

export function createCoreLocalRuntime(options: CoreLocalRuntimeOptions) {
    const { libraryQueries, shelfService } = createCoreLibraryPorts(
        options.database
    )
    const readerService = new ReaderService(
        options.database, options.dataDir, options.externalFileOpener
    )
    const localImport = new CoreLocalImportController(
        new LocalLibraryIngestion(options.database, options.dataDir)
    )
    return { libraryQueries, shelfService, readerService, localImport }
}

export type CoreLocalRuntime = ReturnType<typeof createCoreLocalRuntime>
