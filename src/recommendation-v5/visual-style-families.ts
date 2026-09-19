import {
    buildVisualPrototypes,
    cosineSimilarity,
    type VisualPrototype
} from '../recommendation-v4/visual-style'
import type { buildVisualAuthorAtlasV5 } from './visual-author-atlas'

export const VISUAL_STYLE_FAMILY_V5_VERSION =
    'visual-style-family-v1-mutual-knn'

type VisualAuthorAtlasV5 = ReturnType<
    typeof buildVisualAuthorAtlasV5
>

interface PrototypeNodeV5 {
    nodeId: string
    authorKey: string
    displayName: string
    prototypeId: string
    vector: number[]
    support: number
    representativeComicIds: string[]
    indexedWorkCount: number
}

function round(value: number | null, digits = 6) {
    if (value === null || !Number.isFinite(value)) return null
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

function stableHash(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

function mean(values: number[]) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) /
              values.length
        : null
}

function flattenNodes(
    atlas: VisualAuthorAtlasV5,
    maxAuthors: number
) {
    return atlas.authors
        .slice(0, maxAuthors)
        .flatMap((author) =>
            author.prototypes.map(
                (prototype): PrototypeNodeV5 => ({
                    nodeId: prototype.prototypeId,
                    authorKey: author.authorKey,
                    displayName: author.displayName,
                    prototypeId: prototype.prototypeId,
                    vector: prototype.vector,
                    support: prototype.support,
                    representativeComicIds:
                        prototype.representativeComicIds,
                    indexedWorkCount: author.indexedWorkCount
                })
            )
        )
        .sort(
            (a, b) =>
                b.indexedWorkCount - a.indexedWorkCount ||
                b.support - a.support ||
                a.nodeId.localeCompare(b.nodeId)
        )
}

function connectedComponents(
    nodes: PrototypeNodeV5[],
    edges: Array<{
        leftNodeId: string
        rightNodeId: string
        similarity: number
    }>
) {
    const adjacency = new Map<string, Set<string>>(
        nodes.map((node) => [node.nodeId, new Set<string>()])
    )
    for (const edge of edges) {
        adjacency.get(edge.leftNodeId)?.add(edge.rightNodeId)
        adjacency.get(edge.rightNodeId)?.add(edge.leftNodeId)
    }
    const visited = new Set<string>()
    const components: string[][] = []
    for (const node of nodes) {
        if (visited.has(node.nodeId)) continue
        const stack = [node.nodeId]
        const members: string[] = []
        visited.add(node.nodeId)
        while (stack.length) {
            const current = stack.pop()!
            members.push(current)
            for (const neighbor of adjacency.get(current) ?? []) {
                if (visited.has(neighbor)) continue
                visited.add(neighbor)
                stack.push(neighbor)
            }
        }
        components.push(members.sort())
    }
    return components.sort(
        (a, b) =>
            b.length - a.length ||
            a[0].localeCompare(b[0])
    )
}

function familyPrototype(
    members: PrototypeNodeV5[]
): VisualPrototype | null {
    return (
        buildVisualPrototypes(
            members.map((member) => ({
                comicId: member.nodeId,
                vector: member.vector,
                weight: Math.max(1, member.support)
            })),
            1
        )[0] ?? null
    )
}

export function buildVisualStyleFamiliesV5(input: {
    atlas: VisualAuthorAtlasV5
    maxAuthors?: number
    mutualK?: number
    minimumSimilarity?: number
}) {
    const maxAuthors = Math.max(
        10,
        Math.min(600, input.maxAuthors ?? 300)
    )
    const mutualK = Math.max(
        1,
        Math.min(10, input.mutualK ?? 2)
    )
    const minimumSimilarity = Math.max(
        -1,
        Math.min(1, input.minimumSimilarity ?? -1)
    )
    const nodes = flattenNodes(input.atlas, maxAuthors)
    const byId = new Map(
        nodes.map((node) => [node.nodeId, node])
    )

    const directedNeighbors = new Map<
        string,
        Array<{
            nodeId: string
            similarity: number
        }>
    >()
    for (const node of nodes) {
        const neighbors = nodes
            .filter(
                (other) =>
                    other.nodeId !== node.nodeId &&
                    other.authorKey !== node.authorKey
            )
            .map((other) => ({
                nodeId: other.nodeId,
                similarity: cosineSimilarity(
                    node.vector,
                    other.vector
                )
            }))
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.nodeId.localeCompare(b.nodeId)
            )
            .slice(0, mutualK)
        directedNeighbors.set(node.nodeId, neighbors)
    }

    const edges: Array<{
        leftNodeId: string
        rightNodeId: string
        similarity: number
    }> = []
    const seenEdges = new Set<string>()
    for (const node of nodes) {
        for (const neighbor of directedNeighbors.get(node.nodeId) ?? []) {
            if (neighbor.similarity < minimumSimilarity) continue
            const reverse = directedNeighbors
                .get(neighbor.nodeId)
                ?.find((item) => item.nodeId === node.nodeId)
            if (!reverse) continue
            const [leftNodeId, rightNodeId] = [
                node.nodeId,
                neighbor.nodeId
            ].sort()
            const key = `${leftNodeId}\u0000${rightNodeId}`
            if (seenEdges.has(key)) continue
            seenEdges.add(key)
            edges.push({
                leftNodeId,
                rightNodeId,
                similarity:
                    round(
                        Math.min(
                            neighbor.similarity,
                            reverse.similarity
                        )
                    ) ?? 0
            })
        }
    }
    edges.sort(
        (a, b) =>
            b.similarity - a.similarity ||
            a.leftNodeId.localeCompare(b.leftNodeId) ||
            a.rightNodeId.localeCompare(b.rightNodeId)
    )

    const components = connectedComponents(nodes, edges)
    const families = components.flatMap((component) => {
        if (component.length < 2) return []
        const members = component
            .map((nodeId) => byId.get(nodeId))
            .filter(
                (node): node is PrototypeNodeV5 => Boolean(node)
            )
        const authorKeys = [
            ...new Set(members.map((member) => member.authorKey))
        ].sort()
        if (authorKeys.length < 2) return []
        const memberSet = new Set(component)
        const familyEdges = edges.filter(
            (edge) =>
                memberSet.has(edge.leftNodeId) &&
                memberSet.has(edge.rightNodeId)
        )
        const prototype = familyPrototype(members)
        const representativeComicIds = [
            ...new Set(
                members.flatMap(
                    (member) => member.representativeComicIds
                )
            )
        ].slice(0, 12)
        const familyId = `style-family-${stableHash(
            component.join('|')
        )}`
        return [
            {
                familyId,
                method: 'MUTUAL_KNN_COMPONENT' as const,
                provisional: true,
                nodeCount: members.length,
                authorCount: authorKeys.length,
                authorKeys,
                authorNames: authorKeys.map(
                    (authorKey) =>
                        members.find(
                            (member) =>
                                member.authorKey === authorKey
                        )?.displayName ?? authorKey
                ),
                prototypeIds: component,
                representativeComicIds,
                edgeCount: familyEdges.length,
                edgeSimilarity: {
                    mean: round(
                        mean(
                            familyEdges.map(
                                (edge) => edge.similarity
                            )
                        )
                    ),
                    minimum: familyEdges.length
                        ? round(
                              Math.min(
                                  ...familyEdges.map(
                                      (edge) => edge.similarity
                                  )
                              )
                          )
                        : null,
                    maximum: familyEdges.length
                        ? round(
                              Math.max(
                                  ...familyEdges.map(
                                      (edge) => edge.similarity
                                  )
                              )
                          )
                        : null
                },
                familyPrototype: prototype
                    ? {
                          vector: prototype.vector,
                          support: prototype.support,
                          weight: prototype.weight,
                          representativePrototypeIds:
                              prototype.representativeComicIds
                      }
                    : null
            }
        ]
    })

    families.sort(
        (a, b) =>
            b.nodeCount - a.nodeCount ||
            b.authorCount - a.authorCount ||
            a.familyId.localeCompare(b.familyId)
    )

    const assignedNodes = new Set(
        families.flatMap((family) => family.prototypeIds)
    )
    const memberships = new Map<string, string[]>()
    for (const family of families)
        for (const authorKey of family.authorKeys)
            memberships.set(authorKey, [
                ...(memberships.get(authorKey) ?? []),
                family.familyId
            ])

    return {
        mode: 'READ_ONLY' as const,
        familyVersion: VISUAL_STYLE_FAMILY_V5_VERSION,
        sourceAtlasVersion: input.atlas.atlasVersion,
        method: 'MUTUAL_KNN_CONNECTED_COMPONENTS' as const,
        provisional: true,
        servingImpact: false,
        visualRecallEnabled: false,
        styleDiversityEnabled: false,
        parameters: {
            maxAuthors,
            mutualK,
            minimumSimilarity
        },
        summary: {
            prototypeNodeCount: nodes.length,
            mutualEdgeCount: edges.length,
            familyCount: families.length,
            assignedPrototypeCount: assignedNodes.size,
            singletonOrUnassignedPrototypeCount:
                nodes.length - assignedNodes.size,
            multiFamilyAuthorCount: [...memberships.values()].filter(
                (familyIds) =>
                    new Set(familyIds).size > 1
            ).length,
            largestFamilyPrototypeCount: families[0]?.nodeCount ?? 0
        },
        graph: {
            nodes: nodes.map((node) => ({
                nodeId: node.nodeId,
                authorKey: node.authorKey,
                displayName: node.displayName,
                support: node.support
            })),
            mutualEdges: edges
        },
        families,
        authorMemberships: [...memberships.entries()]
            .map(([authorKey, familyIds]) => ({
                authorKey,
                familyIds: [...new Set(familyIds)].sort()
            }))
            .sort((a, b) => a.authorKey.localeCompare(b.authorKey))
    }
}
