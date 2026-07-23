import assert from 'node:assert/strict';
import test from 'node:test';
import { createTransferPlan, selectTransferRoute } from '../src/image/transfer-route-planner.mjs';

const directState = { dgxCanReachSource: true, windowsCanReachSource: true, sftpAvailable: true, licenseAcknowledged: true, sourceAuthMode: 'none' };
const downloadItem = { artifactId: 'pony', action: 'download', acknowledgementRequired: false };

test('chooses direct DGX download first, then Windows relay, then a truthful manual route', () => {
  assert.deepEqual(selectTransferRoute({ item: downloadItem, transferState: directState }), { route: 'dgx-direct', state: 'awaiting-confirmation', reason: 'DGX_SOURCE_REACHABLE' });
  assert.deepEqual(selectTransferRoute({ item: downloadItem, transferState: { ...directState, dgxCanReachSource: false } }), { route: 'windows-relay', state: 'awaiting-confirmation', reason: 'WINDOWS_RELAY_REQUIRED' });
  assert.deepEqual(selectTransferRoute({ item: downloadItem, transferState: { ...directState, dgxCanReachSource: false, windowsCanReachSource: false } }), { route: 'manual-import', state: 'manual-required', reason: 'NO_AUTOMATED_SOURCE_ROUTE' });
});

test('never hides a license gate, source login requirement, or existing matching artifact', () => {
  assert.deepEqual(selectTransferRoute({ item: { ...downloadItem, acknowledgementRequired: true }, transferState: { ...directState, licenseAcknowledged: false } }), { route: 'blocked', state: 'blocked', reason: 'LICENSE_ACK_REQUIRED' });
  assert.deepEqual(selectTransferRoute({ item: downloadItem, transferState: { ...directState, sourceAuthMode: 'interactive' } }), { route: 'manual-import', state: 'manual-required', reason: 'SOURCE_AUTH_OR_LOGIN_REQUIRED' });
  assert.deepEqual(selectTransferRoute({ item: { artifactId: 'pony', action: 'reuse' }, transferState: directState }), { route: 'reuse-existing', state: 'completed', reason: 'MATCHING_ARTIFACT_ALREADY_PRESENT' });
});

test('summarizes a mixed install plan without allowing a hidden automatic transfer', () => {
  const transfer = createTransferPlan({
    installPlan: { planId: 'install-1', kind: 'install-plan', items: [downloadItem, { artifactId: 'illustrious', action: 'download', acknowledgementRequired: true }] },
    transferState: { ...directState, licenseAcknowledged: false },
  });
  assert.equal(transfer.state, 'blocked');
  assert.deepEqual(transfer.routes.map((item) => item.route), ['dgx-direct', 'blocked']);
});
