chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureTab') {
    handleCaptureTab(message.tabId).then(sendResponse);
    return true; // keep channel open for async response
  }
});

async function handleCaptureTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });

    // Brief delay to let the tab render after activation
    await new Promise((resolve) => setTimeout(resolve, 300));

    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getImageRect
    });

    if (!injectionResult || !injectionResult.result) {
      return { error: 'no image found' };
    }

    const { rect, devicePixelRatio } = injectionResult.result;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });

    return { dataUrl, rect, devicePixelRatio };
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
