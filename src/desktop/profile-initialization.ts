import fs from 'node:fs'
import path from 'node:path'
import { InstanceLock, InstanceOwnershipError } from './instance'
import { desktopPaths, type DesktopPaths } from './paths'
import { PersonalizationService } from '../services/personalization-service'

/** Profile-content initialization belongs to the actual Desktop instance owner. */
export function initializeOwnedDesktopProfile(
    instance: InstanceLock,
    paths: DesktopPaths,
    creatorResourcesRoot?: string
) {
    instance.assertHeld()
    const expected = desktopPaths(paths.root)
    for (const name of [
        'root',
        'data',
        'cache',
        'packs',
        'logs',
        'runtimeState',
        'lock',
        'instance'
    ] as const)
        if (path.resolve(paths[name]) !== path.resolve(expected[name]))
            throw new InstanceOwnershipError()
    if (
        path.resolve(instance.lockFile) !== path.resolve(paths.lock) ||
        path.resolve(instance.infoFile) !== path.resolve(paths.instance)
    )
        throw new InstanceOwnershipError()
    for (const directory of [
        paths.root,
        paths.data,
        paths.cache,
        paths.packs,
        paths.logs,
        paths.runtimeState
    ])
        fs.mkdirSync(directory, { recursive: true })
    const personalization = new PersonalizationService(
        path.join(paths.runtimeState, 'personalization'),
        creatorResourcesRoot
    )
    instance.assertHeld()
    return personalization
}
