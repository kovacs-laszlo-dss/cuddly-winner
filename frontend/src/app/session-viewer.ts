import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
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

  constructor() {
    // Route parameters are observed so navigating between session URLs also works.
    const id = signal(this.route.snapshot.paramMap.get('id')!);
    const subscription = this.route.paramMap.subscribe(params => id.set(params.get('id')!));
    const removeHandler = this.signalr.onSessionUpdated(content => {
      if (content.id === id()) this.accept(content);
    });
    effect(onCleanup => {
      const sessionId = id();
      if (this.signalr.connectionState() !== 'Connected') return;
      let active = true;
      this.error.set('');
      if (untracked(this.content)?.id !== sessionId) this.content.set(null);
      void this.signalr.joinSession(sessionId).then(content => {
        if (active) this.accept(content);
      }).catch(() => {
        if (active) this.error.set('A session nem található vagy már nem érhető el.');
      });
      onCleanup(() => {
        active = false;
        if (this.signalr.connectionState() === 'Connected') {
          void this.signalr.leaveSession(sessionId).catch(() => {});
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      removeHandler();
    });
  }

  private accept(content: SessionContent): void {
    const current = this.content();
    if (!current || current.id !== content.id || content.revision >= current.revision) {
      this.content.set(content);
    }
  }
}
