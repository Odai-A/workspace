import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMERA_SCAN_COOLDOWN_MS,
  getProcessingPollMaxAttempts,
  getStatusPollAttemptParam,
  isLocalProductIncomplete,
  shouldAcceptLocalCacheHit,
} from '../inventory_system/src/utils/scanReliability.js';

test('incomplete FNSKU stub is rejected as a final local hit', () => {
  const stub = {
    fnsku: 'X004AWUF9B',
    asin: '',
    name: 'FNSKU: X004AWUF9B',
    price: '',
    image_url: '',
  };
  assert.equal(isLocalProductIncomplete(stub), true);
  assert.equal(shouldAcceptLocalCacheHit(stub), false);
});

test('complete local product is accepted', () => {
  const product = {
    fnsku: 'X004AWUF9B',
    asin: 'B0D8B91PQF',
    name: 'YUHAO 48 Inch Black Ceiling Fan',
    price: '84.99',
    image_url: 'https://example.com/fan.jpg',
  };
  assert.equal(isLocalProductIncomplete(product), false);
  assert.equal(shouldAcceptLocalCacheHit(product), true);
  assert.equal(shouldAcceptLocalCacheHit(product, true), false);
});

test('pending api result is treated as incomplete', () => {
  const product = {
    fnsku: 'X004AWUF9B',
    asin: '',
    name: 'Pending',
  };
  assert.equal(isLocalProductIncomplete(product, { lookup_still_pending: true }), true);
});

test('poll attempt helpers favor patient single-scan recovery', () => {
  assert.equal(getProcessingPollMaxAttempts(false), 20);
  assert.equal(getProcessingPollMaxAttempts(true), 8);
  assert.equal(getStatusPollAttemptParam(1), 1);
  assert.equal(getStatusPollAttemptParam(40, 12), 12);
  assert.ok(CAMERA_SCAN_COOLDOWN_MS >= 1500);
});
