import { describe, expect, it } from 'vitest';
import { decideSync, type RemoteSnapshot } from './syncEngine';
import type { SyncMetadata } from '../types';

const metadata: SyncMetadata = {
  id: 'primary',
  userId: null,
  deviceId: 'phone',
  deviceLabel: 'Phone',
  lastSyncedRevision: 3,
  lastSyncedHash: 'shared',
  lastSyncedAt: 1,
  autoSync: true
};

const remote: RemoteSnapshot = {
  revision: 3,
  payload: { version: 1, sets: [], cards: [], progress: [], sessions: [] },
  payloadHash: 'shared',
  deviceId: 'desktop',
  updatedAt: '2026-09-17T00:00:00Z'
};

describe('decideSync', () => {
  it('pushes when the account has no cloud snapshot yet', () => {
    expect(decideSync({ localHash: 'local', localHasData: true, metadata, remote: null })).toBe('push');
  });

  it('pulls a cloud library onto a fresh device', () => {
    expect(decideSync({
      localHash: 'empty',
      localHasData: false,
      metadata: { ...metadata, lastSyncedRevision: 0, lastSyncedHash: '' },
      remote: { ...remote, revision: 4, payloadHash: 'cloud' }
    })).toBe('pull');
  });

  it('pushes when only this device changed', () => {
    expect(decideSync({ localHash: 'local-change', localHasData: true, metadata, remote })).toBe('push');
  });

  it('pulls when only the cloud changed', () => {
    expect(decideSync({
      localHash: 'shared',
      localHasData: true,
      metadata,
      remote: { ...remote, revision: 4, payloadHash: 'cloud-change' }
    })).toBe('pull');
  });

  it('stops for an explicit conflict when both sides changed', () => {
    expect(decideSync({
      localHash: 'local-change',
      localHasData: true,
      metadata,
      remote: { ...remote, revision: 4, payloadHash: 'cloud-change' }
    })).toBe('conflict');
  });
});
