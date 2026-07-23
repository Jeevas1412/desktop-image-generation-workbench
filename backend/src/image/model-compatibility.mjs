function indexArtifacts(catalog) {
  return new Map(catalog.artifacts.map((artifact) => [artifact.artifactId, artifact]));
}

export function classifyArtifactCandidate(artifact, candidate) {
  if (!artifact || !candidate) throw new TypeError('artifact and candidate are required.');
  if (candidate.directoryId !== artifact.targetDirectoryId) return 'incompatible';
  const expectedSha256 = artifact.distribution?.sha256 ?? artifact.expectedSha256;
  const verification = candidate.verification ?? {};
  if (expectedSha256 && verification.sha256 === expectedSha256 && verification.architectureFamily === artifact.family && verification.workflowSmoke === 'passed') return 'verified';
  if (candidate.displayName === artifact.expectedFileName) return 'filename-match-candidate';
  if ((artifact.compatibilityAliases ?? []).includes(candidate.displayName)) return 'alias-match-candidate';
  return 'unknown';
}

export function classifyCapability(catalog, capabilityId, candidates) {
  const capability = catalog.capabilities.find((item) => item.capabilityId === capabilityId);
  if (!capability) throw new Error(`Unknown capability: ${capabilityId}.`);
  const artifacts = indexArtifacts(catalog);
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const requirements = capability.requiredArtifactIds.map((artifactId) => {
    const artifact = artifacts.get(artifactId);
    if (!artifact) throw new Error(`Catalog missing artifact: ${artifactId}.`);
    const classified = candidateList
      .map((candidate) => ({ candidate, compatibility: classifyArtifactCandidate(artifact, candidate) }))
      .filter((item) => item.compatibility !== 'incompatible');
    const selected = classified.find((item) => item.compatibility === 'verified')
      ?? classified.find((item) => item.compatibility === 'filename-match-candidate')
      ?? classified.find((item) => item.compatibility === 'alias-match-candidate')
      ?? null;
    return Object.freeze({
      artifactId,
      status: selected?.compatibility ?? (classified.length > 0 ? 'unknown' : 'missing'),
      candidateId: selected?.candidate.candidateId ?? null,
      unknownCandidateIds: Object.freeze(classified.filter((item) => item.compatibility === 'unknown').map((item) => item.candidate.candidateId)),
    });
  });
  const states = requirements.map((item) => item.status);
  const compatibility = states.every((state) => state === 'verified')
    ? 'verified'
    : states.every((state) => ['verified', 'filename-match-candidate', 'alias-match-candidate'].includes(state))
      ? 'candidate-only'
      : states.some((state) => state === 'unknown')
        ? 'unknown'
        : 'missing';
  return Object.freeze({ capabilityId, compatibility, requirements: Object.freeze(requirements) });
}

export function createBindingPlan({ catalog, capabilityId, candidates, now = () => new Date() }) {
  const classification = classifyCapability(catalog, capabilityId, candidates);
  if (classification.compatibility !== 'verified') {
    throw new Error(`Binding plan requires verified artifacts (hash, architecture, and workflow smoke), received ${classification.compatibility}.`);
  }
  return Object.freeze({
    planId: `binding-${capabilityId}-${now().getTime()}`,
    kind: 'binding-plan',
    state: 'awaiting-confirmation',
    capabilityId,
    compatibility: classification.compatibility,
    artifactBindings: Object.freeze(classification.requirements.map((item) => Object.freeze({ artifactId: item.artifactId, candidateId: item.candidateId }))),
    createdAt: now().toISOString(),
  });
}
