import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9229;
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--window-size=1600,1050',
    '--disable-gpu',
    'http://127.0.0.1:8767/'
  ]);

  let targets = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      targets = await fetchJson(`http://127.0.0.1:${PORT}/json`);
      if (targets && targets.length) break;
    } catch (e) {}
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 0;
  const cbs = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && cbs.has(msg.id)) {
      cbs.get(msg.id)(msg.result);
      cbs.delete(msg.id);
    }
  };
  const send = (method, params = {}) => new Promise(res => {
    const cid = ++id;
    cbs.set(cid, res);
    ws.send(JSON.stringify({ id: cid, method, params }));
  });
  const evaluate = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const screenshot = async file => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(file, Buffer.from(res.data, 'base64'));
    console.log('Saved:', file);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1500);

  // Switch to overlay
  await evaluate(`document.querySelectorAll('button')[1].click()`);
  await sleep(2000);

  // Zoom directly into Temghar Dam crest area (18.45° N, 73.54° E)
  await evaluate(`
    // Access leaflet map instance via host element
    const el = document.querySelector('.geographic-map');
    // We can click zoom button 3 times
    const zoomIn = document.querySelector('.leaflet-control-zoom-in');
    if (zoomIn) {
      zoomIn.click();
      setTimeout(() => zoomIn.click(), 400);
      setTimeout(() => zoomIn.click(), 800);
    }
  `);
  await sleep(1500);

  // Switch to Strain Rate
  await evaluate(`
    const btn = Array.from(document.querySelectorAll('.layer-mode-toggle button')).find(b => b.textContent.includes('Strain Rate'));
    if (btn) btn.click();
  `);
  await sleep(1000);
  await screenshot(path.join(ARTIFACT_DIR, 'v34_zoomed_hexagons_strain.png'));

  // Switch to Stress
  await evaluate(`
    const btn = Array.from(document.querySelectorAll('.layer-mode-toggle button')).find(b => b.textContent.includes('Stress'));
    if (btn) btn.click();
  `);
  await sleep(1000);
  await screenshot(path.join(ARTIFACT_DIR, 'v34_zoomed_hexagons_stress.png'));

  ws.close();
  chrome.kill();
  console.log('Zoomed inspection complete!');
}

main().catch(console.error);
