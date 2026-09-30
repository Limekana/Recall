import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

import { fetchRemote } from './privateSync';

afterEach(() => vi.unstubAllGlobals());

describe('Android private sync client', () => {
  it('calls the public HTTPS function, not the WebView localhost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshot: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRemote('test-key')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('https://recall.limecore.dev/api/sync',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }));
  });

  it('does not accept a wrong key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid sync key.' }), { status: 401 })));
    await expect(fetchRemote('wrong-key')).rejects.toThrow('That sync key was not accepted');
  });
});
