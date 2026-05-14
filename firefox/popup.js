const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const permWarning = document.getElementById('permWarning');
const logEl = document.getElementById('log');

const RESTRICTED_SCHEMES = ['about:', 'chrome:', 'resource:', 'moz-extension:', 'data:'];

function log(msg) {
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

async function checkPermissions() {
  const granted = await browser.permissions.contains({ origins: ['<all_urls>'] });
  log('permissions check: ' + (granted ? 'granted' : 'NOT granted'));
  if (!granted) {
    permWarning.style.display = 'block';
    startBtn.disabled = true;
    return false;
  }
  return true;
}

checkPermissions();

startBtn.addEventListener('click', async () => {
  const hasPerms = await checkPermissions();
  if (!hasPerms) return;

  startBtn.disabled = true;
  logEl.textContent = '';
  statusEl.textContent = 'Querying tabs...';
  progressEl.textContent = '';

  let allTabs;
  try {
    allTabs = await browser.tabs.query({ currentWindow: true });
    log('total tabs in window: ' + allTabs.length);
  } catch (err) {
    log('ERROR querying tabs: ' + err.message);
    startBtn.disabled = false;
    return;
  }

  const tabs = allTabs.filter((tab) => {
    if (!tab.url) return false;
    return !RESTRICTED_SCHEMES.some((scheme) => tab.url.startsWith(scheme));
  });

  log('eligible tabs: ' + tabs.length);
  if (tabs.length > 0) {
    log('first tab URL: ' + tabs[0].url);
  }

  const totalTabs = tabs.length;
  statusEl.textContent = `Found ${totalTabs} eligible tabs.`;

  let savedCount = 0;
  let skipped = 0;

  for (let i = 0; i < totalTabs; i++) {
    const tab = tabs[i];
    progressEl.textContent = `Processing tab ${i + 1} of ${totalTabs}...`;

    try {
      // Step 1: inject script to get image rect
      log(`[${i + 1}] injecting into tab ${tab.id}...`);
      const [injectionResult] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const img = document.querySelector('img');
          if (!img) return null;
          const bounds = img.getBoundingClientRect();
          return {
            rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            devicePixelRatio: window.devicePixelRatio
          };
        }
      });

      if (!injectionResult || !injectionResult.result) {
        log(`[${i + 1}] no image found`);
        skipped++;
        continue;
      }

      const { rect, devicePixelRatio } = injectionResult.result;
      log(`[${i + 1}] image: ${rect.width}x${rect.height} @ dpr ${devicePixelRatio}`);

      if (rect.width === 0 || rect.height === 0) {
        log(`[${i + 1}] zero-size image, skipping`);
        skipped++;
        continue;
      }

      // Step 2: capture the tab (Firefox-only, no tab switch needed)
      log(`[${i + 1}] capturing...`);
      const dataUrl = await browser.tabs.captureTab(tab.id, { format: 'png' });
      log(`[${i + 1}] captured, length: ${dataUrl.length}`);

      // Step 3: crop
      const croppedDataUrl = await cropImage(dataUrl, rect, devicePixelRatio);
      log(`[${i + 1}] cropped, length: ${croppedDataUrl.length}`);

      // Step 4: download
      const filename = generateFilename() + '.png';
      await browser.downloads.download({
        url: croppedDataUrl,
        filename: `TabScreenShotter/${filename}`,
        saveAs: false
      });
      log(`[${i + 1}] saved: ${filename}`);

      savedCount++;
    } catch (err) {
      log(`[${i + 1}] ERROR: ${err.message}`);
      skipped++;
    }
  }

  statusEl.textContent = `Done! ${savedCount} screenshot(s) saved.`;
  progressEl.textContent = skipped > 0 ? `${skipped} tab(s) skipped.` : '';
  startBtn.disabled = false;
});

function cropImage(dataUrl, rect, dpr) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cropX = Math.round(rect.x * dpr);
      const cropY = Math.round(rect.y * dpr);
      const cropW = Math.round(rect.width * dpr);
      const cropH = Math.round(rect.height * dpr);

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load captured image'));
    img.src = dataUrl;
  });
}

function generateFilename() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const FILENAME_LENGTH = 18;
  const array = new Uint8Array(FILENAME_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => CHARS[byte % CHARS.length]).join('');
}
