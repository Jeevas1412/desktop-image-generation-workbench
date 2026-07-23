import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageApplicationCore } from '../../backend/src/image/application-core.mjs';
import { createImageDesktopAdapter } from '../src/image-desktop-adapter.mjs';
import { createImageIpcDispatcher } from '../src/ipc-contract.mjs';

test('routes a validated desktop job request into a fixed backend use case', async () => {
  const core = createImageApplicationCore({ useCases: { startJob: async (generation) => ({ accepted: true, prompt: generation.prompt }) } });
  const adapter = createImageDesktopAdapter({ handlers: { startJob: (generation) => core.dispatch({ type: 'image:job:start', payload: { generation } }) } });
  const ipc = createImageIpcDispatcher({ dispatch: adapter.dispatch });
  const generation = { prompt: 'a real test', negativePrompt: '', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5, seedMode: 'increment', loraName: '', loraModelStrength: 0.8, loraClipStrength: 0.8 };
  assert.deepEqual(await ipc.request({ type: 'image:job:start', payload: { generation } }), { accepted: true, prompt: 'a real test' });
});
