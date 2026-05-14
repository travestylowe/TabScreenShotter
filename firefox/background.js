let isRunning = false;
let progress = { current: 0, total: 0, savedCount: 0, skipped: 0, done: false, error: null };

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'startCapture') {
    if (!isRunning) {
      runCapture(message.windowId);
    }
    return Promise.resolve({ started: true });
  }
  if (message.action === 'getProgress') {
    return Promise.resolve({ ...progress });
  }
});

// Keep-alive: prevent Firefox from killing the event page during capture
let keepAliveInterval = null;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    // Any API call resets the idle timer
    browser.runtime.getPlatformInfo();
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

const RESTRICTED_SCHEMES = ['about:', 'chrome:', 'resource:', 'moz-extension:', 'data:'];

function isRestrictedTab(tab) {
  if (!tab.url) return true;
  return RESTRICTED_SCHEMES.some((scheme) => tab.url.startsWith(scheme));
}

async function runCapture(windowId) {
  isRunning = true;
  progress = { current: 0, total: 0, savedCount: 0, skipped: 0, done: false, error: null };
  startKeepAlive();

  try {
    const allTabs = await browser.tabs.query({ windowId });
    const tabs = allTabs.filter((tab) => !isRestrictedTab(tab));
    progress.total = tabs.length;
    progress.skipped = allTabs.length - tabs.length;

    for (let i = 0; i < tabs.length; i++) {
      progress.current = i + 1;
      const tab = tabs[i];

      try {
        await browser.tabs.update(tab.id, { active: true });
        await new Promise((resolve) => setTimeout(resolve, 400));

        const [injectionResult] = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: getImageRect
        });

        if (!injectionResult || !injectionResult.result) {
          progress.skipped++;
          continue;
        }

        const { rect, devicePixelRatio } = injectionResult.result;

        const dataUrl = await browser.tabs.captureVisibleTab(null, {
          format: 'png'
        });

        const croppedDataUrl = await cropImage(dataUrl, rect, devicePixelRatio);

        const filename = generateFilename() + '.png';

        await browser.downloads.download({
          url: croppedDataUrl,
          filename: `TabScreenShotter/${filename}`,
          saveAs: false
        });

        progress.savedCount++;
      } catch (tabErr) {
        progress.skipped++;
        console.error(`TabScreenShotter: failed on tab ${tab.id} (${tab.url}):`, tabErr.message);
      }
    }

    progress.done = true;
  } catch (err) {
    progress.error = err.message;
    progress.done = true;
    console.error('TabScreenShotter: fatal error:', err.message);
  } finally {
    isRunning = false;
    stopKeepAlive();
  }
}

function getImageRect() {
  const img = document.querySelector('img');
  if (!img) return null;

  const bounds = img.getBoundingClientRect();
  return {
    rect: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    },
    devicePixelRatio: window.devicePixelRatio
  };
}

async function cropImage(dataUrl, rect, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const cropX = Math.round(rect.x * dpr);
  const cropY = Math.round(rect.y * dpr);
  const cropW = Math.round(rect.width * dpr);
  const cropH = Math.round(rect.height * dpr);

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  // Convert to data URL — Firefox cannot download blob/object URLs from background scripts
  const buffer = await croppedBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function generateFilename() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const FILENAME_LENGTH = 18;
  const array = new Uint8Array(FILENAME_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => CHARS[byte % CHARS.length]).join('');
}
