// Content script — finds the first <img> element and returns its bounding rect.
// Currently the image detection is handled via chrome.scripting.executeScript
// in background.js. This file exists as a fallback for declarative injection
// if needed in future iterations.

(function () {
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
})();
