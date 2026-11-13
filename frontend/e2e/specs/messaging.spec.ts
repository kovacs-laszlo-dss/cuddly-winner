import { test, expect, createSession, openReceiver, evidenceStep } from '../fixtures';

test('streams edits, Unicode, line breaks, and clearing to a second browser', {
  annotation: { type: 'Business requirement', description: 'Recipients can follow live text changes, read international characters and line breaks, and see shared content cleared. Markup is displayed safely as plain text.' },
}, async ({ page: sender, receiver }) => {
  const url = await createSession(sender);
  await openReceiver(receiver, url);
  const input = sender.getByLabel('Text to share');
  const output = receiver.locator('.shared-text');

  await evidenceStep('When the sender edits the text, then the recipient sees each change as read-only, harmless text', { sender, receiver }, async () => {
    for (const text of ['Hello from the sender', 'Árvíztűrő tükörfúrógép 🔒\nSecond line\n日本語', '<script>alert("test")</script>']) {
      await input.fill(text);
      await expect(output).toHaveText(text);
      await expect(receiver.getByRole('textbox')).toHaveCount(0);
    }
    // Markup must be displayed as text, not rendered or executed.
    await expect(output.locator('script')).toHaveCount(0);
  });
  await evidenceStep('When the sender clears the text, then the recipient sees an empty session', { sender, receiver }, async () => {
    await input.fill('');
    await expect(output).toHaveText('');
    await expect(receiver.getByText('No text to display yet.', { exact: true })).toBeVisible();
  });
});

test('loads the latest message on a late join and after receiver reload', {
  annotation: { type: 'Business requirement', description: 'Recipients joining later or refreshing the page can read the latest shared text and continue receiving live changes.' },
}, async ({ page: sender, receiver }) => {
  const url = await createSession(sender);
  await evidenceStep('Given text was shared before the recipient joined, then opening the link shows the latest text', { sender, receiver }, async () => {
    const sent = sender.waitForEvent('console', { predicate: message => message.text() === 'Message sent.' });
    await sender.getByLabel('Text to share').fill('Written before the receiver joined');
    await sent;
    await receiver.goto(url);
    await expect(receiver.locator('.shared-text')).toHaveText('Written before the receiver joined');
  });
  await evidenceStep('When the recipient refreshes the page, then the latest text remains available', { sender, receiver }, async () => {
    await receiver.reload();
    await expect(receiver.locator('.shared-text')).toHaveText('Written before the receiver joined');
  });
  await evidenceStep('When the sender edits again, then the recipient receives the live update', { sender, receiver }, async () => {
    await sender.getByLabel('Text to share').fill('Live updates still work after reload');
    await expect(receiver.locator('.shared-text')).toHaveText('Live updates still work after reload');
  });
});

test('keeps the final text when many updates are queued rapidly', {
  annotation: { type: 'Business requirement', description: 'Recipients see the final revision even when the sender makes many edits in quick succession.' },
}, async ({ page: sender, receiver }) => {
  await openReceiver(receiver, await createSession(sender));
  await evidenceStep('When the sender makes many rapid edits, then the recipient receives the last queued text', { sender, receiver }, async () => {
    await sender.getByLabel('Text to share').evaluate(element => {
      const textarea = element as HTMLTextAreaElement;
      for (let index = 0; index < 40; index++) {
        textarea.value = `Rapid update ${index}`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await expect(receiver.locator('.shared-text')).toHaveText('Rapid update 39');
  });
  await evidenceStep('When the sender shares a final revision, then the recipient sees that revision', { sender, receiver }, async () => {
    await sender.getByLabel('Text to share').fill('Final confirmed update');
    await expect(receiver.locator('.shared-text')).toHaveText('Final confirmed update');
  });
});

test('logs decryption failure for a wrong key and recovers with the correct URL', {
  annotation: { type: 'Business requirement', description: 'Only recipients with the correct session key can read shared content. Opening the original sharing link restores access after an incorrect key.' },
}, async ({ page: sender, receiver }) => {
  const url = await createSession(sender);
  await openReceiver(receiver, url);
  await evidenceStep('Given the recipient has the correct sharing link, then the shared text is readable', { sender, receiver }, async () => {
    await sender.getByLabel('Text to share').fill('Only the correct key can read this');
    await expect(receiver.locator('.shared-text')).toHaveText('Only the correct key can read this');
  });
  await evidenceStep('When the recipient opens a link with an incorrect key, then an error appears and content is unavailable', { sender, receiver }, async () => {
    const wrongUrl = new URL(url);
    // Change a significant Base64 character, keeping a valid 256-bit key.
    const key = new URLSearchParams(wrongUrl.hash.slice(1)).get('key')!;
    wrongUrl.hash = `key=${key[0] === 'A' ? 'B' : 'A'}${key.slice(1)}`;
    const error = receiver.waitForEvent('console', {
      predicate: message => message.type() === 'error' && message.text() === 'Failed to decrypt the received message.',
    });
    await receiver.goto(wrongUrl.href);
    await expect(receiver.getByRole('alert')).toHaveText('Could not decrypt the message. Check the key in the session URL.');
    await error;
    await expect(receiver.locator('.shared-text')).toHaveCount(0);
  });
  await evidenceStep('When the recipient opens the correct sharing link, then access to the shared text is restored', { sender, receiver }, async () => {
    await receiver.goto(url);
    await expect(receiver.locator('.shared-text')).toHaveText('Only the correct key can read this');
  });
});

for (const target of ['ciphertext', 'authentication tag'] as const) {
  test(`rejects a tampered ${target} and recovers on the next valid message`, {
    annotation: { type: 'Business requirement', description: 'Recipients must not see altered messages, including after refreshing the page, and can read the next intact message.' },
  }, async ({ page: sender, receiver }) => {
    const url = await createSession(sender);
    await openReceiver(receiver, url);
    const input = sender.getByLabel('Text to share');
    await evidenceStep('Given an intact message is shared, then the recipient can read it', { sender, receiver }, async () => {
      await input.fill('Valid message before tampering');
      await expect(receiver.locator('.shared-text')).toHaveText('Valid message before tampering');
    });

    await evidenceStep('When a message is altered in transit, then the recipient sees an error and no shared content', { sender, receiver }, async () => {
      // Corrupt one bit AFTER real encryption. Restore the API immediately so only
      // the next message is altered; SignalR and backend delivery remain real.
      await sender.evaluate(target => {
        const subtle = crypto.subtle;
        const encrypt = subtle.encrypt;
        subtle.encrypt = async function (...args: Parameters<SubtleCrypto['encrypt']>) {
          subtle.encrypt = encrypt;
          const encrypted = await encrypt.apply(this, args);
          const bytes = new Uint8Array(encrypted);
          bytes[target === 'ciphertext' ? 0 : bytes.length - 1] ^= 1;
          return encrypted;
        };
      }, target);

      const failure = receiver.waitForEvent('console', {
        predicate: message => message.type() === 'error' && message.text() === 'Failed to decrypt the received message.',
      });
      await input.fill('This message is modified in transit');
      await failure;
      await expect(receiver.getByRole('alert')).toHaveText('Could not decrypt the message. Check the key in the session URL.');
      await expect(receiver.locator('.shared-text')).toHaveCount(0);
    });

    await evidenceStep('When the recipient refreshes, then the stored altered message is also rejected', { sender, receiver }, async () => {
      // A fresh receiver must also reject the corrupted payload stored by the server.
      await receiver.reload();
      await expect(receiver.getByRole('alert')).toHaveText('Could not decrypt the message. Check the key in the session URL.');
      await expect(receiver.locator('.shared-text')).toHaveCount(0);
    });

    await evidenceStep('When the sender shares an intact message, then the recipient sees it and the error clears', { sender, receiver }, async () => {
      await input.fill('Valid message after tampering');
      await expect(receiver.locator('.shared-text')).toHaveText('Valid message after tampering');
      await expect(receiver.getByRole('alert')).toHaveCount(0);
    });
  });
}

test('rejects a viewer URL with no encryption key', {
  annotation: { type: 'Business requirement', description: 'Recipients opening a link without its encryption key receive an explanation and cannot see shared content.' },
}, async ({ page: sender, receiver }) => {
  await evidenceStep('When the recipient opens a link without its key, then an explanatory error appears and content stays unavailable', { sender, receiver }, async () => {
    const url = new URL(await createSession(sender));
    url.hash = '';
    await receiver.goto(url.href);
    await expect(receiver.getByRole('alert')).toHaveText('The session URL is missing the encryption key.');
    await sender.getByLabel('Text to share').fill('This must not appear without a key');
    await expect(receiver.locator('.shared-text')).toHaveCount(0);
  });
});

test('transfers encrypted binary frames and logs events without content or keys', {
  annotation: { type: 'Business requirement', description: 'Participants can share private text through encrypted binary messages without exposing message contents or session keys in diagnostic logs.' },
}, async ({ page: sender, receiver }) => {
  const sentFrames: (string | Buffer)[] = [];
  const receivedFrames: (string | Buffer)[] = [];
  const logs: string[] = [];
  sender.on('websocket', socket => socket.on('framesent', frame => sentFrames.push(frame.payload)));
  receiver.on('websocket', socket => socket.on('framereceived', frame => receivedFrames.push(frame.payload)));
  sender.on('console', message => logs.push(message.text()));
  receiver.on('console', message => logs.push(message.text()));
  const url = await createSession(sender);
  await openReceiver(receiver, url);
  sentFrames.length = 0;
  receivedFrames.length = 0;
  const secret = 'Unique secret message never sent as plaintext 🔒';
  await evidenceStep('When private text is shared, then the recipient receives it through binary frames without plaintext content', { sender, receiver }, async () => {
    await sender.getByLabel('Text to share').fill(secret);
    await expect(receiver.locator('.shared-text')).toHaveText(secret);
    await expect.poll(() => logs).toContain('Message sent.');
    expect(logs).toContain('Message received.');
    expect(sentFrames.some(Buffer.isBuffer)).toBe(true);
    expect(receivedFrames.some(Buffer.isBuffer)).toBe(true);
    for (const frame of [...sentFrames, ...receivedFrames]) {
      expect(frame.toString()).not.toContain(secret);
    }
  });
  await evidenceStep('Then diagnostic logs contain neither the private text nor the session key', { sender, receiver }, async () => {
    const key = new URLSearchParams(new URL(url).hash.slice(1)).get('key')!;
    for (const log of logs) {
      expect(log).not.toContain(secret);
      expect(log).not.toContain(key);
    }
  });
});
