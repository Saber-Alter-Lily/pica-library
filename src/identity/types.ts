/** Identity consumes only this factual exclusion projection, never a recommendation profile. */
export interface WorkIdentityPolicyFacts {
    readonly explicitDistinctPairs: readonly string[]
}
