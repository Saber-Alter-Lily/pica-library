/** HTTP input failures must not pull any privileged worker code into the
 * ordinary Desktop HTTP server when the signed-source capability is absent. */
export class SignedReaderInputError extends Error {
    constructor() {
        super('Invalid signed source reader command')
        this.name = 'SignedReaderInputError'
    }
}
