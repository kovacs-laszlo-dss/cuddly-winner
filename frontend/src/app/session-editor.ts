import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CryptographyService } from './cryptography.service';
import { FormsModule } from '@angular/forms';
import { SignalrService, SessionCreated } from './signalr.service';

@Component({
  selector: 'app-session-editor',
  imports: [FormsModule],
  template: `
    <main class="editor-shell">
      <section class="panel">
        <div class="panel-heading"><h2>Secure Live Messaging</h2>
          <span class="status" [class.online]="connected()" role="status">{{ connected() ? 'Kapcsolódva' : 'Kapcsolódás…' }}</span></div>
        @if (session()) {
          <label for="session-url">Session URL</label>
          <div class="share-row session-link"><input id="session-url" readonly [value]="sessionUrl()" (focus)="$any($event.target).select()">
            <button class="secondary" (click)="copyLink()">{{ copied() ? 'Másolva' : 'Link másolása' }}</button></div>
        }
        <label for="session-text">Megjelenítendő szöveg</label>
        <textarea id="session-text" [ngModel]="text" (ngModelChange)="onTextChange($event)" rows="18" placeholder="Ide írd a megosztani kívánt szöveget…"></textarea>
      </section>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </main>
  `,
})
export class SessionEditor {
  private readonly signalr = inject(SignalrService);
  private readonly cryptography = inject(CryptographyService);
  private readonly encryptionKey = signal('');
  private key?: CryptoKey;
  readonly connected = computed(() => this.signalr.connectionState() === 'Connected');
  readonly session = signal<SessionCreated | null>(null);
  readonly sessionUrl = computed(() => this.session() ? `${location.origin}/session/${this.session()!.id}#key=${this.encryptionKey()}` : '');
  readonly copied = signal(false);
  readonly error = signal('');
  text = '';
  private creating = false;
  private destroyed = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private updateRetryTimer?: ReturnType<typeof setTimeout>;
  private readonly pendingUpdates: string[] = [];
  private sending = false;

  constructor() {
    effect(() => {
      if (this.connected()) untracked(() => {
        void this.createSession();
        void this.flushUpdates();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.retryTimer);
      clearTimeout(this.updateRetryTimer);
    });
  }

  private async createSession(): Promise<void> {
    if (this.destroyed || this.creating || this.session() || !this.connected()) return;
    clearTimeout(this.retryTimer);
    this.creating = true;
    try {
      const encodedKey = await this.cryptography.generateKey();
      this.key = await this.cryptography.importKey(encodedKey);
      this.encryptionKey.set(encodedKey);
      this.session.set(await this.signalr.createSession());
      this.error.set('');
      void this.flushUpdates();
    } catch {
      if (!this.destroyed) {
        this.error.set('A session létrehozása nem sikerült. Újrapróbálkozás…');
        this.retryTimer = setTimeout(() => { void this.createSession(); }, 5000);
      }
    } finally {
      this.creating = false;
    }
  }

  onTextChange(text: string): void {
    this.text = text;
    this.pendingUpdates.push(text);
    void this.flushUpdates();
  }

  private async flushUpdates(): Promise<void> {
    if (this.destroyed || this.sending || !this.connected() || !this.session()) return;
    clearTimeout(this.updateRetryTimer);
    this.sending = true;
    try {
      const session = this.session()!;
      while (!this.destroyed && this.connected() && this.pendingUpdates.length) {
        const encrypted = await this.cryptography.encrypt(this.pendingUpdates[0], this.key!);
        await this.signalr.updateSession(session.id, session.editKey, encrypted);
        this.pendingUpdates.shift();
        this.error.set('');
      }
    } catch {
      if (!this.destroyed) {
        this.error.set('A szöveg küldése nem sikerült. Újrapróbálkozás…');
        this.updateRetryTimer = setTimeout(() => { void this.flushUpdates(); }, 5000);
      }
    } finally {
      this.sending = false;
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sessionUrl());
      this.copied.set(true);
    } catch {
      this.error.set('A linket jelöld ki és másold ki a mezőből.');
    }
  }
}
