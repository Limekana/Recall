import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RecallSnapshot } from '../src/types';

interface RemoteSnapshot {
  revision: number;
  payload: RecallSnapshot;
  payloadHash: string;
  deviceId: string;
  updatedAt: string;
}

function isRecallSnapshot(value: unknown): value is RecallSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RecallSnapshot>;
  return snapshot.version === 1
    && Array.isArray(snapshot.sets)
    && Array.isArray(snapshot.cards)
    && Array.isArray(snapshot.progress)
    && Array.isArray(snapshot.sessions);
}

function hashSnapshot(snapshot: RecallSnapshot): string {
  const ordered: RecallSnapshot = {
    version: 1,
    sets: [...snapshot.sets].sort((a, b) => a.id.localeCompare(b.id)),
    cards: [...snapshot.cards].sort((a, b) => a.id.localeCompare(b.id)),
    progress: [...snapshot.progress].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    sessions: [...snapshot.sessions].sort((a, b) => a.id.localeCompare(b.id))
  };
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

const BLOB_PATH = 'recall/private/snapshot.json';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(['https://recall.limecore.dev', 'https://localhost', 'capacitor://localhost']);

function originAllowed(origin: string | null): boolean {
  return !origin || ALLOWED_ORIGINS.has(origin)
    || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function response(request: Request, body: object | null, status = 200): Response {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (origin && originAllowed(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

function authorized(request: Request): boolean {
  const expected = process.env.RECALL_SYNC_KEY_SHA256?.trim();
  const bearer = request.headers.get('authorization');
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !bearer?.startsWith('Bearer ')) return false;
  const key = bearer.slice(7);
  if (key.length < 32 || key.length > 128) return false;
  const actual = createHash('sha256').update(key).digest();
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function validSnapshot(snapshot: unknown): snapshot is RecallSnapshot {
  if (!isRecallSnapshot(snapshot)) return false;
  return snapshot.sets.every((set) => typeof set.id === 'string' && typeof set.title === 'string')
    && snapshot.cards.every((card) => typeof card.id === 'string' && typeof card.setId === 'string'
      && typeof card.term === 'string' && typeof card.definition === 'string')
    && snapshot.progress.every((progress) => typeof progress.cardId === 'string')
    && snapshot.sessions.every((session) => typeof session.id === 'string' && typeof session.setId === 'string');
}

async function readRemote(): Promise<{ snapshot: RemoteSnapshot; etag: string } | null> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) throw new Error('Blob read did not return content.');
  const value = JSON.parse(await new Response(result.stream).text()) as Partial<RemoteSnapshot>;
  if (!Number.isSafeInteger(value.revision) || !validSnapshot(value.payload)
    || typeof value.payloadHash !== 'string' || typeof value.deviceId !== 'string'
    || typeof value.updatedAt !== 'string') throw new Error('Stored snapshot is invalid.');
  return { snapshot: value as RemoteSnapshot, etag: result.blob.etag };
}

async function handle(request: Request): Promise<Response> {
  if (!originAllowed(request.headers.get('origin'))) return response(request, { error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return response(request, null, 204);
  if (request.method !== 'GET' && request.method !== 'PUT') return response(request, { error: 'Method not allowed.' }, 405);
  if (!process.env.RECALL_SYNC_KEY_SHA256 || (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)) {
    return response(request, { error: 'Private sync is not configured yet.' }, 503);
  }
  if (!authorized(request)) return response(request, { error: 'Invalid sync key.' }, 401);

  try {
    if (request.method === 'GET') return response(request, { snapshot: (await readRemote())?.snapshot ?? null });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return response(request, { error: 'Expected JSON.' }, 415);
    }
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
      return response(request, { error: 'Library is too large to sync.' }, 413);
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return response(request, { error: 'Library is too large to sync.' }, 413);
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return response(request, { error: 'Invalid JSON.' }, 400); }
    if (!input || typeof input !== 'object') return response(request, { error: 'Invalid sync request.' }, 400);
    const { payload, payloadHash, deviceId, expectedRevision } = input as Record<string, unknown>;
    if (!validSnapshot(payload) || typeof payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(payloadHash)
      || typeof deviceId !== 'string' || deviceId.length < 1 || deviceId.length > 100
      || !Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) {
      return response(request, { error: 'Invalid sync request.' }, 400);
    }
    if (await hashSnapshot(payload) !== payloadHash) {
      return response(request, { error: 'Library checksum did not match.' }, 400);
    }
    const current = await readRemote();
    if ((current?.snapshot.revision ?? 0) !== expectedRevision) {
      return response(request, { error: 'The cloud copy changed on another device.' }, 409);
    }
    const snapshot: RemoteSnapshot = {
      revision: (expectedRevision as number) + 1,
      payload,
      payloadHash,
      deviceId,
      updatedAt: new Date().toISOString()
    };
    try {
      await put(BLOB_PATH, JSON.stringify(snapshot), {
        access: 'private', contentType: 'application/json',
        ...(current ? { allowOverwrite: true, ifMatch: current.etag } : {})
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || (!current && await readRemote())) {
        return response(request, { error: 'The cloud copy changed on another device.' }, 409);
      }
      throw error;
    }
    return response(request, { snapshot });
  } catch {
    return response(request, { error: 'Private sync is temporarily unavailable. Your local library is safe.' }, 503);
  }
}

export default { fetch: handle };
