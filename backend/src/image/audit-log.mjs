import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ACTIONS = new Set(['download_plan', 'download_complete', 'model_binding', 'generation_submit', 'generation_complete', 'generation_stop', 'semifinished_clear', 'failure']);
const SECRET_KEY = /(?:token|password|secret|authorization|cookie|api[_-]?key|credential)/i;
const PROMPT_KEY = /(?:prompt|descriptor|reference_data)/i;

function safeRoot(value) { const root = path.resolve(String(value ?? '')); if (root === path.parse(root).root) throw new Error('AUDIT_ROOT_NOT_ALLOWED'); return root; }
function redact(value, { retainPrompts }) {
  if (Array.isArray(value)) return value.map((entry) => redact(entry, { retainPrompts }));
  if (!value || typeof value !== 'object') return typeof value === 'string' && /(?:bearer\s+|https?:\/\/[^\s]+@)/i.test(value) ? '[REDACTED]' : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : PROMPT_KEY.test(key) && !retainPrompts ? '[NOT_RETAINED]' : redact(entry, { retainPrompts })]));
}

export function buildAuditEvent({ action, outcome = 'ok', details = {}, occurredAt = new Date().toISOString(), retainPrompts = false } = {}) {
  if (!ACTIONS.has(action)) throw new Error('AUDIT_ACTION_NOT_ALLOWED');
  if (!['ok', 'blocked', 'failed'].includes(outcome)) throw new Error('AUDIT_OUTCOME_NOT_ALLOWED');
  return { version: 1, occurred_at: occurredAt, action, outcome, prompt_retained: retainPrompts === true, details: redact(details, { retainPrompts: retainPrompts === true }) };
}

export async function appendAuditEvent({ auditRoot, ...input }) {
  const root = safeRoot(auditRoot); const event = buildAuditEvent(input); await mkdir(root, { recursive: true });
  const file = path.join(root, 'image-workflow-audit.jsonl'); await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8'); return event;
}

export async function readAuditEvents(auditRoot) {
  const file = path.join(safeRoot(auditRoot), 'image-workflow-audit.jsonl');
  const raw = await readFile(file, 'utf8').catch((error) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
