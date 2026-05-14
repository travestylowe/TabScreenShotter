const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

let pollInterval = null;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Starting capture...';
  progressEl.textContent = '';

  const currentWindow = await browser.windows.getCurrent();

  await browser.runtime.sendMessage({
    action: 'startCapture',
    windowId: currentWindow.id
  });

  pollInterval = setInterval(async () => {
    const p = await browser.runtime.sendMessage({ action: 'getProgress' });
    progressEl.textContent = `Processing tab ${p.current} of ${p.total}...`;

    if (p.done) {
      clearInterval(pollInterval);
      statusEl.textContent = `Done! ${p.savedCount} screenshot(s) saved.`;
      progressEl.textContent = '';
      startBtn.disabled = false;
    }
  }, 500);
});
