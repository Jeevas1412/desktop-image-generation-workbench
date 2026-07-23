import { beginRound, completeRound, createImageJob, requestStop } from './job-controller.mjs';
import { buildFluxWorkflow, buildIllustriousWorkflow, buildPonyWorkflow } from './workflow-builders.mjs';

function builder(engine) {
  if (engine === 'pony') return buildPonyWorkflow;
  if (engine === 'illustrious_lowres') return buildIllustriousWorkflow;
  if (engine === 'flux') return buildFluxWorkflow;
  throw new Error('ORCHESTRATOR_ENGINE_NOT_ALLOWED');
}

export async function runMockImageJob({ job, generation = {}, submitWorkflow, review, shouldStop = () => false }) {
  if (typeof submitWorkflow !== 'function' || typeof review !== 'function') throw new Error('ORCHESTRATOR_ADAPTER_REQUIRED');
  let state = job ?? createImageJob({ jobId: generation.jobId, ownerId: 'image-studio', rounds: generation.rounds, seedMode: generation.seedMode, seed: generation.seed, rangeStart: generation.rangeStart, rangeEnd: generation.rangeEnd });
  const build = builder(generation.engine ?? 'flux');
  while (state.status !== 'completed' && state.status !== 'stopped') {
    if (shouldStop(state)) state = requestStop(state, 'image-studio');
    state = beginRound(state, 'image-studio');
    if (state.status === 'stopped') break;
    const active = state.attempts.at(-1); const workflow = build({ ...generation, prompt: generation.prompt, negativePrompt: generation.negativePrompt ?? '', seed: active.seed });
    const submitted = await submitWorkflow(workflow, { round: active.round, seed: active.seed });
    const verdict = await review({ workflow, promptId: submitted.promptId, round: active.round, seed: active.seed });
    state = completeRound(state, 'image-studio', { promptId: submitted.promptId, review: verdict, artifact: submitted.artifact ?? null });
    if (verdict?.pass && state.status === 'queued') { state.currentRound = state.rounds; state.status = 'completed'; }
  }
  return state;
}
