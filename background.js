let isRunning = false;
let progress = { current: 0, total: 0, savedCount: 0, done: false, error: null };
let directoryHandle = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    if (!isRunning) {
      runCapture();
    }
    sendResponse({ started: true });
  }
  if (message.action === 'getProgress') {
    sendResponse(progress);
  }
  if (message.action === 'setDirectoryHandle') {
    // Directory handle must be passed from popup since service worker can't show picker
    directoryHandle = message.handle;
    sendResponse({ ok: true });
  }
  return false;
});

async function runCapture() {
  isRunning = true;
  progress = { current: 0, total: 0, savedCount: 0, done: false, error: null };

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    progress.total = tabs.length;

    for (let i = 0; i < tabs.length; i++) {
      progress.current = i + 1;
      const tab = tabs[i];

      try {
        await chrome.tabs.update(tab.id, { active: true });
        await new Promise((resolve) => setTimeout(resolve, 300));

        const [injectionResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getImageRect
        });

        if (!injectionResult || !injectionResult.result) {
          continue;
        }

        const { rect, devicePixelRatio } = injectionResult.result;

        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
          format: 'png'
        });

        const croppedDataUrl = await cropImage(dataUrl, rect, devicePixelRatio);

        const filename = generateFilename() + '.png';

        await chrome.downloads.download({
          url: croppedDataUrl,
          filename: `TabScreenShotter/${filename}`,
          saveAs: false
        });

        progress.savedCount++;
      } catch (tabErr) {
        // Skip this tab, continue to next
      }
    }

    progress.done = true;
  } catch (err) {
    progress.error = err.message;
    progress.done = true;
  } finally {
    isRunning = false;
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
  return URL.createObjectURL(croppedBlob);
}

function generateFilename() {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const FILENAME_LENGTH = 18;
  const array = new Uint8Array(FILENAME_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => CHARS[byte % CHARS.length]).join('');
}
