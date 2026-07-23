import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReferenceInstruction, buildReviewInstruction, buildTranslationInstruction, containsChinese, humanAnatomyApplicable, normalizeReferenceDescriptor, normalizeReview, parseVlmJson, validateTranslatedPrompt } from '../src/image/vlm-contracts.mjs';

test('parses fenced VLM JSON and validates a fully English translation', () => {
  assert.deepEqual(parseVlmJson('```json\n{"prompt":"a red fox"}\n```'), { prompt: 'a red fox' });
  assert.equal(validateTranslatedPrompt('{"prompt":"a red fox"}'), 'a red fox');
  assert.throws(() => validateTranslatedPrompt('{"prompt":"一只 red fox"}'), /VLM_TRANSLATION_CONTAINS_CHINESE/);
  assert.equal(containsChinese('red fox'), false);
  assert.match(buildTranslationInstruction({ prompt: '狐狸', engine: 'pony' }), /Pony Diffusion/);
});

test('uses original requirement to decide whether anatomy review applies', () => {
  assert.equal(humanAnatomyApplicable('无人城市夜景'), false);
  assert.equal(humanAnatomyApplicable('a full-body anthropomorphic raccoon'), true);
  assert.equal(humanAnatomyApplicable('a person, no people'), false);
});

test('reference analysis has a fixed type vocabulary and does not assume a person', () => {
  assert.deepEqual(normalizeReferenceDescriptor('{"subject_type":"scene_environment","descriptor":"misty pine valley at dawn"}'), { subject_type: 'scene_environment', descriptor: 'misty pine valley at dawn' });
  assert.throws(() => normalizeReferenceDescriptor('{"subject_type":"animal","descriptor":"一只 fox"}'), /VLM_REFERENCE_DESCRIPTOR_CONTAINS_CHINESE/);
  assert.match(buildReferenceInstruction(), /Do not assume a person is present/);
});

test('strips anatomy inertia for non-person review but preserves prompt mismatch feedback', () => {
  const review = normalizeReview({ score: 74, hard_failures: ['hands are malformed', 'unexpected person in product shot'], issues: ['手部异常', '主体边缘有伪影'], prompt_patch: 'natural hands, clean product edges', summary: '手部结构有问题' }, { requirement: '无人产品静物', threshold: 80 });
  assert.deepEqual(review.hard_failures, ['unexpected person in product shot']);
  assert.deepEqual(review.issues, ['主体边缘有伪影']);
  assert.equal(review.prompt_patch, 'clean product edges');
  assert.equal(review.summary, '已按非人物任务审核提示词一致性、构图、画质与伪影。');
  assert.equal(review.pass, false);
});

test('review instruction makes prompt primary and excludes unrelated policy dimensions', () => {
  const instruction = buildReviewInstruction({ requirement: 'a red object', hasReference: true, referenceWeight: 0.1 });
  assert.match(instruction, /Reference similarity is secondary \(10%\)/); assert.match(instruction, /Do NOT evaluate text, logos, content sensitivity/);
});

test('rejects oversized VLM review fields before they reach task history', () => {
  assert.throws(() => normalizeReview({ score: 90, issues: Array(21).fill('artifact'), hard_failures: [], prompt_patch: '', summary: '' }), /VLM_REVIEW_OUTPUT_TOO_LARGE/);
  assert.throws(() => normalizeReview({ score: 90, issues: [], hard_failures: [], prompt_patch: 'x'.repeat(2_001), summary: '' }), /VLM_REVIEW_OUTPUT_TOO_LARGE/);
});
