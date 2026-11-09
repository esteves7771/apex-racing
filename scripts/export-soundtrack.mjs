import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { startServer } from './server.mjs';
const server = await startServer(5183);
process.on('exit', () => server.kill());
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5183');
  await page.getByRole('button', { name: 'Drive Pine Valley' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Drive Pine Valley' }).click();
  await fs.mkdir('test-results/v08', { recursive: true });
  for (const name of ['menu', 'race', 'coast', 'canyon', 'challenge']) {
    const bytes = await page.evaluate((name) => {
      const asset = window.apexDebug.audio.music.assets[name],
        a = asset.base.getChannelData(0),
        b = asset.energy.getChannelData(0),
        rate = asset.base.sampleRate;
      const out = new Uint8Array(44 + a.length * 2),
        view = new DataView(out.buffer),
        ascii = (offset, text) => {
          for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
        };
      ascii(0, 'RIFF');
      view.setUint32(4, out.length - 8, true);
      ascii(8, 'WAVE');
      ascii(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      ascii(36, 'data');
      view.setUint32(40, a.length * 2, true);
      for (let i = 0; i < a.length; i++)
        view.setInt16(
          44 + i * 2,
          Math.max(-1, Math.min(1, (a[i] + b[i] * 0.5) * 0.8)) * 32767,
          true,
        );
      let binary = '';
      for (let i = 0; i < out.length; i += 16384)
        binary += String.fromCharCode(...out.subarray(i, i + 16384));
      return btoa(binary);
    }, name);
    await fs.writeFile(`test-results/v08/audio-${name}.wav`, Buffer.from(bytes, 'base64'));
  }
  console.log('Exported five original soundtrack previews');
} finally {
  await browser.close();
  server.kill();
}
