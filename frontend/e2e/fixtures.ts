import { test as base, expect, type Page } from '@playwright/test';

// The sender uses Playwright's browser; the receiver runs in a second browser
// process, with its own storage, connection, and encryption key imported from URL.
export const test = base.extend<{ receiver: Page; evidence: void }>({
  receiver: async ({ playwright, browserName, headless, baseURL }, use, testInfo) => {
    const browser = await playwright[browserName].launch({ headless });
    const context = await browser.newContext({ baseURL, recordVideo: { dir: testInfo.outputPath('receiver-video') } });
    const receiver = await context.newPage();
    try {
      await use(receiver);
    } finally {
      await context.close();
      const video = await receiver.video()?.path();
      if (video) await testInfo.attach('receiver-video', { path: video, contentType: 'video/webm' });
      await browser.close();
    }
  },
  evidence: [async ({ page: sender, receiver }, use, testInfo) => {
    const events: object[] = [];
    for (const [role, page] of Object.entries({ sender, receiver })) {
      const record = (type: string, detail: string) => events.push({ time: new Date().toISOString(), role, type, detail: detail.replace(/(#key=)[A-Za-z0-9_-]+/g, '$1[REDACTED]') });
      page.on('console', message => record(`console.${message.type()}`, message.text()));
      page.on('pageerror', error => record('pageerror', error.message));
      page.on('requestfailed', request => record('requestfailed', `${request.method()} ${request.url()} ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) record('http-error', `${response.status()} ${response.url()}`); });
      page.on('websocket', socket => {
        socket.on('framesent', frame => record('websocket-sent', `${typeof frame.payload === 'string' ? 'text' : 'binary'} ${Buffer.byteLength(frame.payload)} bytes`));
        socket.on('framereceived', frame => record('websocket-received', `${typeof frame.payload === 'string' ? 'text' : 'binary'} ${Buffer.byteLength(frame.payload)} bytes`));
        socket.on('socketerror', error => record('websocket-error', error));
      });
    }
    try { await use(); } finally {
      await testInfo.attach('browser-diagnostics', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
      for (const [role, page] of Object.entries({ sender, receiver })) {
        if (!page.isClosed()) await testInfo.attach(`${role}-final`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    }
  }, { auto: true }],
});

export { expect };

export async function createSession(sender: Page): Promise<string> {
  return test.step('Given the sender starts a private sharing session and receives a link containing its key', async () => {
    await sender.goto('/');
    const link = sender.getByLabel('Session URL');
    await expect(link).toHaveValue(/\/session\/[a-f0-9]+#key=[A-Za-z0-9_-]{43}$/);
    return link.inputValue();
  });
}

export async function openReceiver(receiver: Page, url: string): Promise<void> {
  await test.step('Given a recipient opens the sharing link in a separate browser and sees an empty session', async () => {
    await receiver.goto(url);
    await expect(receiver.getByText('No text to display yet.', { exact: true })).toBeVisible();
  });
}

export async function evidenceStep(name: string, pages: Record<string, Page>, body: () => Promise<void>): Promise<void> {
  await test.step(name, async () => {
    try {
      await body();
    } finally {
      for (const [role, page] of Object.entries(pages)) {
        if (!page.isClosed()) await test.info().attach(`${role}: ${name}`, {
          body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
        });
      }
    }
  });
}