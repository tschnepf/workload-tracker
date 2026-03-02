import { describe, expect, it } from 'vitest';

import { base64UrlToUint8Array } from './push';

describe('push utils', () => {
  it('decodes base64url VAPID keys', () => {
    const source = btoa('hello-world').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const out = base64UrlToUint8Array(source);
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(out.byteLength).toBeGreaterThan(0);
  });
});
