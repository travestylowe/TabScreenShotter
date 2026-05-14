const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const permWarning = document.getElementById('permWarning');

const RESTRICTED_SCHEMES = ['about:', 'chrome:', 'resource:', 'moz-extension:', 'data:'];

// Check if host permissions are granted
async function checkPermissions() {
  const granted = await browser.permissions.contains({ origins: ['<all_urls>'] });
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
  statusEl.textContent = 'Querying tabs...';
  progressEl.textContent = '';

  const allTabs = await browser.tabs.query({ currentWindow: true });
  const tabs = allTabs.filter((tab) => {
    if (!tab.url) return false;
    return !RESTRICTED_SCHEMES.some((scheme) => tab.url.startsWith(scheme));
  });

  const totalTabs = tabs.length;
  statusEl.textContent = `Found ${totalTabs} eligible tabs.`;

  let savedCount = 0;
  let skipped = 0;

  for (let i = 0; i < totalTabs; i++) {
    const tab = tabs[i];
    progressEl.textContent = `Processing tab ${i + 1} of ${totalTabs}...`;

    try {
      // Get image bounding rect by injecting into the tab
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
        skipped++;
        continue;
      }

      const { rect, devicePixelRatio } = injectionResult.result;

      if (rect.width === 0 || rect.height === 0) {
        skipped++;
        continue;
      }

      // Capture the tab without switching to it (Firefox-only API)
      const dataUrl = await browser.tabs.captureTab(tab.id, { format: 'png' });

      // Crop to image bounds
      const croppedDataUrl = await cropImage(dataUrl, rect, devicePixelRatio);

      // Save
      const filename = generateFilename() + '.png';
      await browser.downloads.download({
        url: croppedDataUrl,
        filename: `TabScreenShotter/${filename}`,
        saveAs: false
      });

      savedCount++;
    } catch (err) {
      console.error(`TabScreenShotter: tab ${tab.id} (${tab.url}) failed:`, err);
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
