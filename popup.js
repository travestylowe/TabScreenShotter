const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

let pollInterval = null;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Starting capture...';
  progressEl.textContent = '';

  chrome.runtime.sendMessage({ action: 'startCapture' });

  pollInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'getProgress' }, (p) => {
      if (!p) return;
      progressEl.textContent = `Processing tab ${p.current} of ${p.total}...`;

      if (p.done) {
        clearInterval(pollInterval);
        statusEl.textContent = `Done! ${p.savedCount} screenshot(s) saved.`;
        progressEl.textContent = '';
        startBtn.disabled = false;
      }
    });
  }, 500);
});
