let isRunning = false;
let progress = { current: 0, total: 0, savedCount: 0, skipped: 0, done: false, error: null };

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'startCapture') {
    console.log('TabScreenShotter: received startCapture, windowId:', message.windowId);
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
    console.log('TabScreenShotter: total tabs found:', allTabs.length);
    console.log('TabScreenShotter: tab URLs:', allTabs.map((t) => t.url));

    const tabs = allTabs.filter((tab) => !isRestrictedTab(tab));
    console.log('TabScreenShotter: non-restricted tabs:', tabs.length);

    progress.total = tabs.length;
    progress.skipped = allTabs.length - tabs.length;

    for (let i = 0; i < tabs.length; i++) {
      progress.current = i + 1;
      const tab = tabs[i];
      console.log(`TabScreenShotter: [${i + 1}/${tabs.length}] processing tab ${tab.id}: ${tab.url}`);

      try {
        await browser.tabs.update(tab.id, { active: true });
        console.log(`TabScreenShotter: [${i + 1}] tab activated, waiting for paint...`);

        await waitForTabActive(tab.id);
        console.log(`TabScreenShotter: [${i + 1}] paint wait complete`);

        const [injectionResult] = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: getImageRect
        });
        console.log(`TabScreenShotter: [${i + 1}] injection result:`, JSON.stringify(injectionResult?.result));

        if (!injectionResult || !injectionResult.result) {
          console.log(`TabScreenShotter: [${i + 1}] no image found, skipping`);
          progress.skipped++;
          continue;
        }

        const { rect, devicePixelRatio } = injectionResult.result;
        console.log(`TabScreenShotter: [${i + 1}] image rect:`, JSON.stringify(rect), 'dpr:', devicePixelRatio);

        const dataUrl = await captureWithRetry();
        console.log(`TabScreenShotter: [${i + 1}] captured, dataUrl length:`, dataUrl.length);

        const croppedDataUrl = await cropImage(dataUrl, rect, devicePixelRatio);
        console.log(`TabScreenShotter: [${i + 1}] cropped, dataUrl length:`, croppedDataUrl.length);

        const filename = generateFilename() + '.png';

        await browser.downloads.download({
          url: croppedDataUrl,
          filename: `TabScreenShotter/${filename}`,
          saveAs: false
        });
        console.log(`TabScreenShotter: [${i + 1}] saved as ${filename}`);

        progress.savedCount++;
      } catch (tabErr) {
        progress.skipped++;
        console.error(`TabScreenShotter: [${i + 1}] FAILED on tab ${tab.id} (${tab.url}):`, tabErr);
      }
    }

    progress.done = true;
    console.log('TabScreenShotter: complete. saved:', progress.savedCount, 'skipped:', progress.skipped);
  } catch (err) {
    progress.error = err.message;
    progress.done = true;
    console.error('TabScreenShotter: FATAL error:', err);
  } finally {
    isRunning = false;
    stopKeepAlive();
  }
}

function waitForTabActive(tabId) {
  return new Promise((resolve) => {
    function listener(activeInfo) {
      if (activeInfo.tabId === tabId) {
        browser.tabs.onActivated.removeListener(listener);
        setTimeout(resolve, 500);
      }
    }
    browser.tabs.onActivated.addListener(listener);
    setTimeout(() => {
      browser.tabs.onActivated.removeListener(listener);
      resolve();
    }, 2000);
  });
}

const MAX_CAPTURE_RETRIES = 5;
const RETRY_DELAYS_MS = [200, 400, 800, 1500, 3000];

async function captureWithRetry() {
  for (let attempt = 0; attempt < MAX_CAPTURE_RETRIES; attempt++) {
    try {
      const result = await browser.tabs.captureVisibleTab(null, { format: 'png' });
      if (attempt > 0) console.log(`TabScreenShotter: capture succeeded on attempt ${attempt + 1}`);
      return result;
    } catch (err) {
      console.warn(`TabScreenShotter: capture attempt ${attempt + 1} failed:`, err.message);
      if (attempt === MAX_CAPTURE_RETRIES - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
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
