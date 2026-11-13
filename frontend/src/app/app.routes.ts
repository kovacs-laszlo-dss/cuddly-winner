import { Routes } from '@angular/router';
import { SessionEditor } from './components/session-editor';
import { SessionViewer } from './components/session-viewer';

export const routes: Routes = [
  { path: '', component: SessionEditor, pathMatch: 'full' },
  { path: 'session/:id', component: SessionViewer },
  { path: '**', redirectTo: '' },
];
