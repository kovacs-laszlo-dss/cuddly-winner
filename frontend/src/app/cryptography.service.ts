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

  async encrypt(text: string, key: CryptoKey): Promise<string> {
    // A fresh 96-bit nonce is required for every message, including retries.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return `v1.${this.encode(iv)}.${this.encode(new Uint8Array(ciphertext))}`;
  }

  async decrypt(payload: string, key: CryptoKey): Promise<string> {
    const [version, nonce, ciphertext, extra] = payload.split('.');
    if (version !== 'v1' || !nonce || !ciphertext || extra !== undefined) throw new Error('Invalid encrypted message');
    const iv = this.decode(nonce);
    if (iv.length !== 12) throw new Error('Invalid nonce');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, this.decode(ciphertext));
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
