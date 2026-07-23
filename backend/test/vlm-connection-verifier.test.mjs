import assert from 'node:assert/strict';
import test from 'node:test';
import { createVlmConnectionVerifier } from '../src/image/vlm-connection-verifier.mjs';

test('verifies only a resolved private VLM models endpoint and returns its numeric address', async () => {
  const verifier = createVlmConnectionVerifier({
    lookup: async () => ({ address: '192.168.1.30' }),
    fetchImpl: async (url) => {
      assert.equal(String(url), 'http://192.168.1.30:8003/v1/models');
      return new Response(JSON.stringify({ data: [{ id: 'qwen3-vl' }] }), { status: 200 });
    },
  });
  const result = await verifier.inspect({ host: 'vlm.lan', port: 8003 });
  assert.equal(result.state, 'reachable');
  assert.equal(result.address, '192.168.1.30');
});

test('rejects public addresses before any VLM request', async () => {
  let fetched = false;
  const verifier = createVlmConnectionVerifier({
    lookup: async () => ({ address: '8.8.8.8' }),
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  assert.equal((await verifier.verify({ host: 'public.example', port: 8003 })).state, 'not_lan');
  assert.equal(fetched, false);
});
