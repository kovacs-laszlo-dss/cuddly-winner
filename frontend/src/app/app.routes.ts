import { Routes } from '@angular/router';
import { SessionEditor } from './session-editor';
import { SessionViewer } from './session-viewer';

export const routes: Routes = [
  { path: '', component: SessionEditor, pathMatch: 'full' },
  { path: 'session/:id', component: SessionViewer },
  { path: '**', redirectTo: '' },
];
