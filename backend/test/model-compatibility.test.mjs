import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyArtifactCandidate, classifyCapability, createBindingPlan } from '../src/image/model-compatibility.mjs';

const catalog = {
  artifacts: [
    { artifactId: 'pony', family: 'sdxl-pony', targetDirectoryId: 'comfy.checkpoints', expectedFileName: 'pony.safetensors', expectedSha256: 'pony-hash', compatibilityAliases: ['pony-v6.safetensors'] },
    { artifactId: 'vae', family: 'sdxl', targetDirectoryId: 'comfy.vae', expectedFileName: 'sdxl_vae.safetensors', expectedSha256: 'vae-hash' },
  ],
  capabilities: [{ capabilityId: 'image.anime_portrait.pony', requiredArtifactIds: ['pony', 'vae'] }],
};

const filenameCandidates = [
  { candidateId: 'comfy.checkpoints:pony.safetensors', directoryId: 'comfy.checkpoints', displayName: 'pony.safetensors' },
  { candidateId: 'comfy.vae:sdxl_vae.safetensors', directoryId: 'comfy.vae', displayName: 'sdxl_vae.safetensors' },
];

test('treats filename and aliases only as candidates until hash, architecture, and workflow smoke all pass', () => {
  assert.equal(classifyArtifactCandidate(catalog.artifacts[0], filenameCandidates[0]), 'filename-match-candidate');
  assert.equal(classifyArtifactCandidate(catalog.artifacts[0], { candidateId: 'alias', directoryId: 'comfy.checkpoints', displayName: 'pony-v6.safetensors' }), 'alias-match-candidate');
  assert.equal(classifyArtifactCandidate(catalog.artifacts[0], { candidateId: 'verified', directoryId: 'comfy.checkpoints', displayName: 'other.safetensors', verification: { sha256: 'pony-hash', architectureFamily: 'sdxl-pony', workflowSmoke: 'passed' } }), 'verified');
  assert.equal(classifyArtifactCandidate(catalog.artifacts[0], { candidateId: 'unknown', directoryId: 'comfy.checkpoints', displayName: 'other.safetensors' }), 'unknown');
  assert.equal(classifyArtifactCandidate(catalog.artifacts[0], { candidateId: 'wrong-dir', directoryId: 'comfy.vae', displayName: 'pony.safetensors' }), 'incompatible');
});

test('returns candidate-only until every required artifact has verification evidence', () => {
  assert.equal(classifyCapability(catalog, 'image.anime_portrait.pony', filenameCandidates).compatibility, 'candidate-only');
  assert.equal(classifyCapability(catalog, 'image.anime_portrait.pony', [{ candidateId: 'unknown', directoryId: 'comfy.checkpoints', displayName: 'some-pony-like-name.safetensors' }, filenameCandidates[1]]).compatibility, 'unknown');
  assert.equal(classifyCapability(catalog, 'image.anime_portrait.pony', [filenameCandidates[0]]).compatibility, 'missing');
});

test('creates a confirmation-only binding plan only after required verification evidence', () => {
  assert.throws(() => createBindingPlan({ catalog, capabilityId: 'image.anime_portrait.pony', candidates: filenameCandidates }), /requires verified artifacts/);
  const verifiedCandidates = [
    { ...filenameCandidates[0], verification: { sha256: 'pony-hash', architectureFamily: 'sdxl-pony', workflowSmoke: 'passed' } },
    { ...filenameCandidates[1], verification: { sha256: 'vae-hash', architectureFamily: 'sdxl', workflowSmoke: 'passed' } },
  ];
  const plan = createBindingPlan({ catalog, capabilityId: 'image.anime_portrait.pony', candidates: verifiedCandidates, now: () => new Date('2026-07-20T13:00:00.000Z') });
  assert.deepEqual(plan, {
    planId: 'binding-image.anime_portrait.pony-1784552400000', kind: 'binding-plan', state: 'awaiting-confirmation', capabilityId: 'image.anime_portrait.pony', compatibility: 'verified',
    artifactBindings: [
      { artifactId: 'pony', candidateId: 'comfy.checkpoints:pony.safetensors' },
      { artifactId: 'vae', candidateId: 'comfy.vae:sdxl_vae.safetensors' },
    ],
    createdAt: '2026-07-20T13:00:00.000Z',
  });
});
