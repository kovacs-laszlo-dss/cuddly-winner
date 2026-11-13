import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { combineLatest } from 'rxjs';
import { CryptographyService } from './cryptography.service';
import { ActivatedRoute } from '@angular/router';
import { SessionContent, SignalrService } from './signalr.service';

@Component({
  selector: 'app-session-viewer',
  template: `
    <main class="viewer-shell">
      @if (error()) { <p class="viewer-message" role="alert">{{ error() }}</p> }
      @else if (content(); as session) {
        <div class="shared-text">{{ session.text }}</div>
        @if (!session.text) { <p class="viewer-message">Még nincs megjeleníthető szöveg.</p> }
      } @else { <p class="viewer-message" role="status">Session betöltése…</p> }
      @if (content() && signalr.connectionState() !== 'Connected') {
        <p class="connection-notice" role="status">A kapcsolat megszakadt. Újracsatlakozás…</p>
      }
    </main>
  `,
})
export class SessionViewer {
  readonly signalr = inject(SignalrService);
  readonly content = signal<SessionContent | null>(null);
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
        this.error.set('Hiányzó titkosítási kulcs a session URL-ben.');
        return;
      }
      const key = this.cryptography.importKey(encodedKey);
      void key.catch(() => {
        if (active) this.error.set('Érvénytelen titkosítási kulcs.');
      });
      const accept = async (content: SessionContent): Promise<void> => {
        if (!active || content.id !== id || content.revision < revision) return;
        revision = content.revision;
        try {
          const imported = await key;
          // Revision zero is the server's empty, newly created session.
          const text = content.revision === 0 && content.text === ''
            ? '' : await this.cryptography.decrypt(content.text, imported);
          if (active && content.revision === revision) {
            this.content.set({ ...content, text });
            this.error.set('');
          }
        } catch {
          if (active && content.revision === revision) {
            this.error.set('Az üzenet nem fejthető vissza. Ellenőrizd a session URL kulcsát.');
          }
        }
      };
      const removeHandler = this.signalr.onSessionUpdated(content => { void accept(content); });
      if (connected) {
        void this.signalr.joinSession(id).then(accept).catch(() => {
          if (active) this.error.set('A session nem található vagy már nem érhető el.');
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