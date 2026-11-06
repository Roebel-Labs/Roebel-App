import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { missingKeys, REQUIRED } = require('../../scripts/patch-electron-plist.cjs');

describe('patch-electron-plist missingKeys', () => {
  it('reports everything for an empty plist', () => {
    expect(missingKeys({})).toEqual(Object.keys(REQUIRED));
    expect(missingKeys(undefined)).toEqual(Object.keys(REQUIRED));
  });
  it('reports nothing when all keys are set', () => {
    expect(missingKeys({ ...REQUIRED })).toEqual([]);
  });
  it('flags the continuity key when false or the stock English text', () => {
    const stock = { ...REQUIRED, NSCameraUseContinuityCameraDeviceType: false, NSCameraUsageDescription: 'This app needs access to the camera' };
    expect(missingKeys(stock)).toEqual(['NSCameraUseContinuityCameraDeviceType', 'NSCameraUsageDescription']);
  });
});
