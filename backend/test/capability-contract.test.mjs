import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('capability verification contract requires the same evidence dimensions used for verified bindings', async () => {
  const schema = JSON.parse(await readFile(new URL('../../contracts/image/capability.schema.json', import.meta.url), 'utf8'));
  const verification = schema.$defs.candidate.properties.verification;
  assert.equal(verification.type, 'object');
  assert.deepEqual(verification.required, ['state', 'sha256', 'architectureFamily', 'workflowSmoke']);
  assert.deepEqual(verification.properties.workflowSmoke.enum, ['not-run', 'passed', 'failed']);
});
