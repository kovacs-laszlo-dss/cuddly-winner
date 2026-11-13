import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const output = fileURLToPath(new URL('../../artifacts/playwright-backend/', import.meta.url));

const build = spawn('dotnet', ['build', 'backend/Backend.csproj', '--output', output], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
build.on('error', error => { console.error(error); process.exit(1); });
build.on('exit', code => {
  if (code !== 0) process.exit(code ?? 1);
  const server = spawn('dotnet', [`${output}/Backend.dll`, '--urls', 'http://127.0.0.1:5258'], {
    cwd: backend, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' },
  });
  server.on('error', error => { console.error(error); process.exit(1); });
  server.on('exit', code => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());
});
