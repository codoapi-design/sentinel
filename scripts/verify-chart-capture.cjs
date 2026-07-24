/**
 * Verify chart capture pipeline in a real Chromium browser.
 * Writes scripts/tmp/chart-capture-sample.png + metrics.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(__dirname, 'tmp');
const HTML = path.join(__dirname, 'verify-chart-capture.html');

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    console.error('puppeteer-core not installed');
    process.exit(1);
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome/Edge found');
    process.exit(1);
  }
  console.log('Using browser:', executablePath);

  // Serve the HTML + allow CDN modules via local static of just the file is enough;
  // page imports modern-screenshot from jsdelivr.
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url?.startsWith('/verify-chart-capture')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(HTML));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/verify-chart-capture.html`;
  console.log('Serving', url);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Wait for capture result
    await page.waitForFunction(
      () => window.__CAPTURE_RESULT__ && typeof window.__CAPTURE_RESULT__.ok === 'boolean',
      { timeout: 45000 },
    );

    const result = await page.evaluate(() => {
      const r = window.__CAPTURE_RESULT__;
      return {
        ok: r.ok,
        dataUrlLength: r.dataUrlLength,
        width: r.width,
        height: r.height,
        error: r.error || null,
        dataUrl: r.dataUrl || null,
      };
    });

    const metricsPath = path.join(TMP, 'metrics.json');
    const pngPath = path.join(TMP, 'chart-capture-sample.png');

    if (result.dataUrl && result.dataUrl.startsWith('data:image/png;base64,')) {
      const b64 = result.dataUrl.slice('data:image/png;base64,'.length);
      fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
      console.log('Wrote', pngPath, fs.statSync(pngPath).size, 'bytes');
    }

    const metrics = {
      ok: result.ok,
      dataUrlLength: result.dataUrlLength,
      width: result.width,
      height: result.height,
      error: result.error,
      pngBytes: fs.existsSync(pngPath) ? fs.statSync(pngPath).size : 0,
      pngPath: fs.existsSync(pngPath) ? pngPath : null,
      browser: executablePath,
    };
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));

    if (!result.ok || !metrics.pngBytes || metrics.pngBytes < 5000) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
