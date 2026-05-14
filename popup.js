const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

let directoryHandle = null;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Selecting folder...';
  progressEl.textContent = '';

  try {
    directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    statusEl.textContent = 'Folder selection cancelled.';
    startBtn.disabled = false;
    return;
  }

  statusEl.textContent = 'Starting capture...';

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const totalTabs = tabs.length;

  for (let i = 0; i < totalTabs; i++) {
    const tab = tabs[i];
    progressEl.textContent = `Processing tab ${i + 1} of ${totalTabs}...`;

    const result = await chrome.runtime.sendMessage({
      action: 'captureTab',
      tabId: tab.id
    });

    if (result.error) {
      progressEl.textContent = `Tab ${i + 1}: skipped (${result.error})`;
      continue;
    }

    const croppedBlob = await cropImage(
      result.dataUrl,
      result.rect,
      result.devicePixelRatio
    );

    const filename = generateFilename() + '.png';
    const fileHandle = await directoryHandle.getFile
      ? await directoryHandle.getFileHandle(filename, { create: true })
      : null;

    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(croppedBlob);
      await writable.close();
    }
  }

  statusEl.textContent = `Done! ${totalTabs} tab(s) processed.`;
  progressEl.textContent = '';
  startBtn.disabled = false;
});

function cropImage(dataUrl, rect, dpr) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropX = Math.round(rect.x * dpr);
      const cropY = Math.round(rect.y * dpr);
      const cropW = Math.round(rect.width * dpr);
      const cropH = Math.round(rect.height * dpr);

      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
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
