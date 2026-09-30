import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { hashSnapshot } from '../src/sync/syncEngine';
import type { RecallSnapshot } from '../src/types';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => ({
  get: mocks.get,
  put: mocks.put,
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {}
}));

import handler from '../api/sync';

const key = 'x'.repeat(40); // Test-only placeholder, not a production credential.
const empty: RecallSnapshot = { version: 1, sets: [], cards: [], progress: [], sessions: [] };
let stored: string | null;
let etag: string;

function request(method: string, body?: object, origin = 'https://localhost', bearer = key): Request {
  return new Request('https://recall.limecore.dev/api/sync', {
    method,
    headers: {
      Origin: origin,
      Authorization: `Bearer ${bearer}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

beforeEach(() => {
  stored = null;
  etag = 'etag-0';
  process.env.RECALL_SYNC_KEY_SHA256 = createHash('sha256').update(key).digest('hex');
  process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
  mocks.get.mockReset().mockImplementation(async () => stored ? {
    statusCode: 200,
    stream: new Blob([stored]).stream(),
    blob: { etag }
  } : null);
  mocks.put.mockReset().mockImplementation(async (_path, value: string, options) => {
    if (stored && (!options.allowOverwrite || options.ifMatch !== etag)) throw new Error('Precondition failed');
    stored = value;
    etag = 'etag-next';
  });
});

afterEach(() => {
  delete process.env.RECALL_SYNC_KEY_SHA256;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe('private sync function', () => {
  it('accepts Android CORS preflight but rejects a wrong key', async () => {
    const preflight = await handler.fetch(request('OPTIONS'));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    const denied = await handler.fetch(request('GET', undefined, 'https://localhost', 'wrong-key'.repeat(5)));
    expect(denied.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('creates a private snapshot and reads the latest version', async () => {
    const payloadHash = await hashSnapshot(empty);
    const created = await handler.fetch(request('PUT', {
      payload: empty, payloadHash, deviceId: 'phone', expectedRevision: 0
    }));
    expect(created.status).toBe(200);
    expect((await created.json()).snapshot.revision).toBe(1);
    expect(mocks.put).toHaveBeenCalledWith('recall/private/snapshot.json', expect.any(String),
      expect.objectContaining({ access: 'private', contentType: 'application/json' }));
    const fetched = await handler.fetch(request('GET'));
    expect((await fetched.json()).snapshot.revision).toBe(1);
    expect(mocks.get).toHaveBeenCalledWith('recall/private/snapshot.json', { access: 'private', useCache: false });
  });

  it('rejects stale revisions without overwriting the saved copy', async () => {
    const payloadHash = await hashSnapshot(empty);
    await handler.fetch(request('PUT', { payload: empty, payloadHash, deviceId: 'phone', expectedRevision: 0 }));
    const before = stored;
    const stale = await handler.fetch(request('PUT', { payload: empty, payloadHash, deviceId: 'desktop', expectedRevision: 0 }));
    expect(stale.status).toBe(409);
    expect(stored).toBe(before);
  });

  it('rejects an invalid checksum and untrusted browser origin', async () => {
    const invalid = await handler.fetch(request('PUT', { payload: empty, payloadHash: '0'.repeat(64), deviceId: 'phone', expectedRevision: 0 }));
    expect(invalid.status).toBe(400);
    const origin = await handler.fetch(request('GET', undefined, 'https://untrusted.example'));
    expect(origin.status).toBe(403);
    expect(stored).toBeNull();
  });
});
