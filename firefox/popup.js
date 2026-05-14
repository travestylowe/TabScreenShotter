const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Starting capture...';
  progressEl.textContent = '';

  const tabs = await browser.tabs.query({ currentWindow: true });
  const totalTabs = tabs.length;
  let savedCount = 0;

  for (let i = 0; i < totalTabs; i++) {
    const tab = tabs[i];
    progressEl.textContent = `Processing tab ${i + 1} of ${totalTabs}...`;

    const result = await browser.runtime.sendMessage({
      action: 'captureTab',
      tabId: tab.id
    });

    if (result.error) {
      progressEl.textContent = `Tab ${i + 1}: skipped (${result.error})`;
      continue;
    }

    savedCount++;
  }

  statusEl.textContent = `Done! ${savedCount} screenshot(s) saved.`;
  progressEl.textContent = '';
  startBtn.disabled = false;
});
