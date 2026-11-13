import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  private readonly connection = new HubConnectionBuilder()
    .withUrl('/hubs/application')
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

  private scheduleRetry(): void {
    if (!this.destroyed) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => { void this.start(); }, 5000);
    }
  }
}
