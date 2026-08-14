import type { LibraryDatabase } from '../library/database'
import type { FavoriteRecord, LibraryFacetQuery } from '../library/types'
import type { LibraryQueryService } from './library-query-service'

export class ShelfService {
    constructor(
        private readonly database: LibraryDatabase,
        private readonly queries: LibraryQueryService
    ) {}

    list() {
        return this.database.listShelves()
    }

    create(name: string) {
        return this.database.createShelf(name)
    }

    rename(id: string, name: string) {
        return this.database.renameShelf(id, name)
    }

    delete(id: string) {
        return this.database.deleteShelf(id)
    }

    contents(id: string) {
        return this.database.listShelfComics(id)
    }

    add(id: string, comicIds: string[], records: FavoriteRecord[] = []) {
        if (records.length)
            this.database.importCatalog(records, 'shelf:selection')
        return this.database.addShelfItems(id, comicIds)
    }

    addFiltered(id: string, query: LibraryFacetQuery) {
        const comicIds = this.queries.allIds(query)
        return this.database.addShelfItems(id, comicIds)
    }

    remove(id: string, comicIds: string[]) {
        return this.database.removeShelfItems(id, comicIds)
    }
}
