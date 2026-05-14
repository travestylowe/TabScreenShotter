browser.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'captureTab') {
    return handleCaptureTab(message.tabId);
  }
});

async function handleCaptureTab(tabId) {
  try {
    await browser.tabs.update(tabId, { active: true });

    // Brief delay to let the tab render after activation
    await new Promise((resolve) => setTimeout(resolve, 300));

    const [injectionResult] = await browser.scripting.executeScript({
      target: { tabId },
      func: getImageRect
    });

    if (!injectionResult || !injectionResult.result) {
      return { error: 'no image found' };
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

    return { success: true };
  } catch (err) {
    return { error: err.message };
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
