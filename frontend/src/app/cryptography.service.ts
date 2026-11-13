import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CryptographyService {
  async generateKey(): Promise<string> {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    return this.encode(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  }

  async importKey(encoded: string): Promise<CryptoKey> {
    const bytes = this.decode(encoded);
    if (bytes.length !== 32) throw new Error('Invalid session key');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async encrypt(text: string, key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
    // A fresh 96-bit nonce is required for every message, including retries.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    // Binary format: version (1 byte), IV (12 bytes), ciphertext with GCM tag.
    const payload = new Uint8Array(13 + ciphertext.byteLength);
    payload[0] = 1;
    payload.set(iv, 1);
    payload.set(new Uint8Array(ciphertext), 13);
    return payload;
  }

  async decrypt(payload: Uint8Array, key: CryptoKey): Promise<string> {
    if (!(payload instanceof Uint8Array) || payload.length < 29 || payload[0] !== 1) throw new Error('Invalid encrypted message');
    const iv = new Uint8Array(payload.subarray(1, 13));
    const ciphertext = new Uint8Array(payload.subarray(13));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  }

  private encode(bytes: Uint8Array): string {
    return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private decode(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  }
}
