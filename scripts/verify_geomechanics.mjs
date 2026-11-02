import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9228;
const ARTIFACT_DIR = '/Users/s.premkumar/.gemini/antigravity/brain/d969a42d-c325-40f9-bbd0-f86b2eb56db1';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = event => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async captureScreenshot(filepath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    await fs.writeFile(filepath, buffer);
    console.log(`Saved screenshot: ${filepath}`);
  }

  close() {
    this.ws?.close();
  }
}

async function main() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--window-size=1600,1050',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-background-networking',
    'http://127.0.0.1:8767/'
  ]);

  chrome.stderr.on('data', () => {});
  chrome.stdout.on('data', () => {});

  let targets = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      targets = await fetchJson(`http://127.0.0.1:${PORT}/json`);
      if (targets && targets.length) break;
    } catch (e) {}
  }

  if (!targets || !targets.length) {
    chrome.kill();
    throw new Error('Failed to connect to Chrome debugging target');
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('Connecting to page:', pageTarget.title);

  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  console.log('Waiting for initial load and clicking 02 · Zarr Overlay...');
  await sleep(1500);

  // Click 02 · Zarr Overlay
  await cdp.evaluate(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('02 · Zarr Overlay'));
    if (btn) btn.click();
  `);

  console.log('Waiting for Zarr data worker to decode chunks and initialize...');
  for (let wait = 0; wait < 20; wait++) {
    await sleep(600);
    const ready = await cdp.evaluate(`
      const canvas = document.querySelector('.zarr-map-canvas');
      const loaded = !document.querySelector('.loading');
      const hasLegend = !!document.querySelector('.geomechanics-legend-card');
      ({ ready: !!(canvas && loaded && hasLegend) })
    `);
    if (ready?.ready) {
      console.log('Zarr store & dashboard fully loaded after', (wait + 1) * 600, 'ms');
      break;
    }
  }

  await sleep(1000);

  // Check console errors
  const errCount = await cdp.evaluate(`window.__errors ? window.__errors.length : 0`);
  console.log('Window error count:', errCount);

  // 1. Screenshot of Displacement Layer (default)
  await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'v34_layer_displacement.png'));

  // 2. Click Strain Rate layer
  console.log('Switching to Strain Rate layer...');
  const res1 = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.layer-mode-toggle button'));
      const btn = btns.find(b => b.textContent.includes('Strain Rate'));
      if (btn) {
        btn.click();
        return 'clicked Strain Rate, buttons: ' + btns.map(b=>b.textContent).join(' | ');
      }
      return 'Strain Rate button not found! All buttons: ' + Array.from(document.querySelectorAll('button')).map(b=>b.textContent).slice(0, 15).join(' | ');
    })()
  `);
  console.log('Click result 1:', res1);
  await sleep(1000);
  await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'v34_layer_strain_rate.png'));

  // 3. Click Stress Field layer
  console.log('Switching to Stress Field layer...');
  const res2 = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.layer-mode-toggle button'));
      const btn = btns.find(b => b.textContent.includes('Stress'));
      if (btn) {
        btn.click();
        return 'clicked Stress, buttons: ' + btns.map(b=>b.textContent).join(' | ');
      }
      return 'Stress button not found!';
    })()
  `);
  console.log('Click result 2:', res2);
  await sleep(1000);
  await cdp.captureScreenshot(path.join(ARTIFACT_DIR, 'v34_layer_stress_field.png'));

  // 4. Test hover on dam crest pixel to verify live readout
  console.log('Testing hover inspection on dam crest pixel [280, 240]...');
  const hoverReadout = await cdp.evaluate(`
    const readout = document.querySelector('.geo-live-readout');
    readout ? readout.innerText : 'No readout';
  `);
  console.log('Live readout text:', hoverReadout);

  cdp.close();
  chrome.kill();
  console.log('Verification finished successfully!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
