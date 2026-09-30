import { Capacitor } from '@capacitor/core';
import type { RecallSnapshot } from '../types';
import { isRecallSnapshot, type RemoteSnapshot } from './syncEngine';

const KEY_STORAGE = 'recall-private-sync-key';
const endpoint = Capacitor.isNativePlatform()
  ? 'https://recall.limecore.dev/api/sync'
  : '/api/sync';

export function savedSyncKey(): string | null {
  return localStorage.getItem(KEY_STORAGE);
}

export function saveSyncKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key);
}

export function clearSyncKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

async function requestSync(key: string, method: 'GET' | 'PUT', body?: object): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new Error('Could not reach private sync. Check your connection and try again.');
  }
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    if (response.status === 401) throw new Error('That sync key was not accepted. Check it and try again.');
    if (response.status === 409) throw new Error('The cloud copy changed on another device. Sync again to review it.');
    throw new Error(result?.error ?? `Private sync is unavailable (${response.status}).`);
  }
  return result;
}

function parseRemote(value: unknown): RemoteSnapshot | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('Private sync returned an invalid response.');
  const remote = value as Partial<RemoteSnapshot>;
  if (!Number.isSafeInteger(remote.revision) || !isRecallSnapshot(remote.payload)
    || typeof remote.payloadHash !== 'string' || typeof remote.deviceId !== 'string'
    || typeof remote.updatedAt !== 'string') {
    throw new Error('The cloud copy uses an unsupported Recall data format.');
  }
  return remote as RemoteSnapshot;
}

export async function fetchRemote(key: string): Promise<RemoteSnapshot | null> {
  const response = await requestSync(key, 'GET');
  if (!response || typeof response !== 'object' || !('snapshot' in response)) {
    throw new Error('Private sync returned an invalid response.');
  }
  return parseRemote(response.snapshot);
}

export async function pushSnapshot(
  key: string,
  payload: RecallSnapshot,
  payloadHash: string,
  deviceId: string,
  expectedRevision: number
): Promise<RemoteSnapshot> {
  const response = await requestSync(key, 'PUT', { payload, payloadHash, deviceId, expectedRevision }) as { snapshot?: unknown };
  const remote = parseRemote(response?.snapshot);
  if (!remote) throw new Error('Private sync did not return a snapshot.');
  return remote;
}
