import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendAuditEvent, buildAuditEvent, readAuditEvents } from '../src/image/audit-log.mjs';

test('writes only supported auditable actions and redacts credentials and prompts by default', () => {
  const event = buildAuditEvent({ action: 'generation_submit', details: { prompt: 'private request', api_token: 'secret', nested: { authorization: 'Bearer abc', model: 'pony' } }, occurredAt: '2026-07-20T00:00:00.000Z' });
  assert.equal(event.details.prompt, '[NOT_RETAINED]'); assert.equal(event.details.api_token, '[REDACTED]'); assert.equal(event.details.nested.authorization, '[REDACTED]'); assert.equal(event.details.nested.model, 'pony');
  assert.throws(() => buildAuditEvent({ action: 'shell_execute' }), /AUDIT_ACTION_NOT_ALLOWED/);
});

test('retains a prompt only when settings explicitly enable it', () => {
  const event = buildAuditEvent({ action: 'generation_complete', retainPrompts: true, details: { prompt: 'allowed local record', access_token: 'never' } });
  assert.equal(event.prompt_retained, true); assert.equal(event.details.prompt, 'allowed local record'); assert.equal(event.details.access_token, '[REDACTED]');
});

test('appends and reads a local JSONL audit trail in a temporary directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-audit-'));
  try { await appendAuditEvent({ auditRoot: root, action: 'generation_stop', outcome: 'ok', details: { jobId: 'job-1' } }); await appendAuditEvent({ auditRoot: root, action: 'semifinished_clear', outcome: 'ok', details: { removed: 3 } }); const events = await readAuditEvents(root); assert.equal(events.length, 2); assert.equal(events[1].action, 'semifinished_clear'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
