import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SignalrService } from '../services/signalr.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    void inject(SignalrService).start();
  }
}
