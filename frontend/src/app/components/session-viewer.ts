import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { combineLatest } from 'rxjs';
import { CryptographyService } from '../services/cryptography.service';
import { ActivatedRoute } from '@angular/router';
import { SessionContent, SignalrService } from '../services/signalr.service';

@Component({
  selector: 'app-session-viewer',
  template: `
    <main class="viewer-shell">
      @if (error()) { <p class="viewer-message" role="alert">{{ error() }}</p> }
      @else if (content(); as session) {
        <div class="shared-text">{{ session.text }}</div>
        @if (!session.text) { <p class="viewer-message">No text to display yet.</p> }
      } @else { <p class="viewer-message" role="status">Loading session…</p> }
      @if (content() && signalr.connectionState() !== 'Connected') {
        <p class="connection-notice" role="status">Connection lost. Reconnecting…</p>
      }
    </main>
  `,
})
export class SessionViewer {
  readonly signalr = inject(SignalrService);
  readonly content = signal<(Omit<SessionContent, 'text'> & { text: string }) | null>(null);
  readonly error = signal('');
  private readonly route = inject(ActivatedRoute);

  private readonly cryptography = inject(CryptographyService);

  constructor() {
    const route = signal({ id: this.route.snapshot.paramMap.get('id')!, fragment: this.route.snapshot.fragment });
    const subscription = combineLatest([this.route.paramMap, this.route.fragment]).subscribe(([params, fragment]) => {
      route.set({ id: params.get('id')!, fragment });
    });
    effect(onCleanup => {
      const { id, fragment } = route();
      const connected = this.signalr.connectionState() === 'Connected';
      let active = true;
      let revision = -1;
      this.content.set(null);
      this.error.set('');
      const encodedKey = new URLSearchParams(fragment ?? '').get('key');
      if (!encodedKey) {
        this.error.set('The session URL is missing the encryption key.');
        return;
      }
      const key = this.cryptography.importKey(encodedKey);
      void key.catch(() => {
        if (active) this.error.set('Invalid encryption key.');
      });
      const accept = async (content: SessionContent): Promise<void> => {
        if (!active || content.id !== id || content.revision < revision) return;
        revision = content.revision;
        try {
          const imported = await key;
          // Revision zero is the server's empty, newly created session.
          const text = content.revision === 0 && content.text.length === 0
            ? '' : await this.cryptography.decrypt(content.text, imported);
          if (active && content.revision === revision) {
            this.content.set({ ...content, text });
            this.error.set('');
          }
        } catch {
          console.error('Failed to decrypt the received message.');
          if (active && content.revision === revision) {
            this.error.set('Could not decrypt the message. Check the key in the session URL.');
          }
        }
      };
      const removeHandler = this.signalr.onSessionUpdated(content => { void accept(content); });
      if (connected) {
        void this.signalr.joinSession(id).then(accept).catch(() => {
          if (active) this.error.set('The session was not found or is no longer available.');
        });
      }
      onCleanup(() => {
        active = false;
        removeHandler();
        if (connected && this.signalr.connectionState() === 'Connected') {
          void this.signalr.leaveSession(id).catch(() => {});
        }
      });
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
