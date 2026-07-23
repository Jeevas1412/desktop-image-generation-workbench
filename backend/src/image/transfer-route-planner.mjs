const ROUTES = Object.freeze({
  reuse: 'reuse-existing',
  direct: 'dgx-direct',
  relay: 'windows-relay',
  manual: 'manual-import',
  blocked: 'blocked',
});

function checkState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('transfer state is required.');
  for (const field of ['dgxCanReachSource', 'windowsCanReachSource', 'sftpAvailable', 'licenseAcknowledged']) {
    if (typeof state[field] !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  }
  if (!['none', 'interactive', 'token'].includes(state.sourceAuthMode)) throw new TypeError('sourceAuthMode is invalid.');
}

export function selectTransferRoute({ item, transferState }) {
  if (!item || typeof item !== 'object') throw new TypeError('install plan item is required.');
  checkState(transferState);
  if (item.action === 'reuse') {
    return Object.freeze({ route: ROUTES.reuse, state: 'completed', reason: 'MATCHING_ARTIFACT_ALREADY_PRESENT' });
  }
  if (item.action !== 'download') throw new Error('INSTALL_ACTION_INVALID');
  if (item.acknowledgementRequired && !transferState.licenseAcknowledged) {
    return Object.freeze({ route: ROUTES.blocked, state: 'blocked', reason: 'LICENSE_ACK_REQUIRED' });
  }
  if (transferState.sourceAuthMode !== 'none') {
    return Object.freeze({ route: ROUTES.manual, state: 'manual-required', reason: 'SOURCE_AUTH_OR_LOGIN_REQUIRED' });
  }
  if (transferState.dgxCanReachSource) {
    return Object.freeze({ route: ROUTES.direct, state: 'awaiting-confirmation', reason: 'DGX_SOURCE_REACHABLE' });
  }
  if (transferState.windowsCanReachSource && transferState.sftpAvailable) {
    return Object.freeze({ route: ROUTES.relay, state: 'awaiting-confirmation', reason: 'WINDOWS_RELAY_REQUIRED' });
  }
  return Object.freeze({ route: ROUTES.manual, state: 'manual-required', reason: 'NO_AUTOMATED_SOURCE_ROUTE' });
}

export function createTransferPlan({ installPlan, transferState }) {
  if (!installPlan || installPlan.kind !== 'install-plan' || !Array.isArray(installPlan.items)) {
    throw new TypeError('A validated install plan is required.');
  }
  const routes = installPlan.items.map((item) => Object.freeze({ artifactId: item.artifactId, ...selectTransferRoute({ item, transferState }) }));
  const blocked = routes.some((item) => item.state === 'blocked');
  const manual = routes.some((item) => item.state === 'manual-required');
  return Object.freeze({
    installPlanId: installPlan.planId,
    state: blocked ? 'blocked' : manual ? 'manual-required' : 'awaiting-confirmation',
    routes: Object.freeze(routes),
  });
}
