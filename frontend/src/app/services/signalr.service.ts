import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack';

export interface SessionContent {
  id: string;
  text: Uint8Array;
  revision: number;
}

export interface SessionCreated {
  id: string;
  editKey: string;
}

@Injectable({ providedIn: 'root' })
export class SignalrService {
  private readonly connection = new HubConnectionBuilder()
    .withUrl('/hubs/application')
    .withHubProtocol(new MessagePackHubProtocol())
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 5000 })
    .build();
  private readonly state = signal(HubConnectionState.Disconnected);
  private readonly serverTime = signal<string | null>(null);
  private retryTimer?: ReturnType<typeof setTimeout>;
  private starting?: Promise<void>;
  private destroyed = false;

  readonly connectionState = this.state.asReadonly();
  readonly lastServerTime = this.serverTime.asReadonly();

  constructor() {
    this.connection.on('SessionUpdated', () => console.log('Message received.'));
    this.connection.on('Connected', (serverTime: string) => this.serverTime.set(serverTime));
    this.connection.onreconnecting(() => this.state.set(HubConnectionState.Reconnecting));
    this.connection.onreconnected(() => this.state.set(HubConnectionState.Connected));
    this.connection.onclose(() => {
      this.state.set(HubConnectionState.Disconnected);
      this.scheduleRetry();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.retryTimer);
      void this.connection.stop();
    });
  }

  start(): Promise<void> {
    if (this.destroyed || this.connection.state !== HubConnectionState.Disconnected) {
      return this.starting ?? Promise.resolve();
    }
    clearTimeout(this.retryTimer);
    this.state.set(HubConnectionState.Connecting);
    this.starting = this.connection.start()
      .then(() => this.state.set(HubConnectionState.Connected))
      .catch(() => {
        this.state.set(HubConnectionState.Disconnected);
        this.scheduleRetry();
      })
      .finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async ping(): Promise<string> {
    const serverTime = await this.connection.invoke<string>('Ping');
    this.serverTime.set(serverTime);
    return serverTime;
  }

  createSession(): Promise<SessionCreated> {
    return this.connection.invoke('CreateSession');
  }

  async joinSession(id: string): Promise<SessionContent> {
    const content = await this.connection.invoke<SessionContent>('JoinSession', id);
    console.log('Current session message received.');
    return content;
  }

  leaveSession(id: string): Promise<void> {
    return this.connection.invoke('LeaveSession', id);
  }

  async updateSession(id: string, editKey: string, text: Uint8Array): Promise<SessionContent> {
    const content = await this.connection.invoke<SessionContent>('UpdateSession', id, editKey, text);
    console.log('Message sent.');
    return content;
  }

  onSessionUpdated(handler: (content: SessionContent) => void): () => void {
    this.connection.on('SessionUpdated', handler);
    return () => this.connection.off('SessionUpdated', handler);
  }

  private scheduleRetry(): void {
    if (!this.destroyed) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => { void this.start(); }, 5000);
    }
  }
}
