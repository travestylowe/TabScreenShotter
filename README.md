# TabScreenShotter

Browser extension that screenshots every image tab in the current window, cropped to image bounds, saved as PNGs with random 18-char alphanumeric filenames.

## Versions

- **Root directory** — Chrome/Edge (Manifest V3)
- **`firefox/`** — Firefox (Manifest V3, Gecko)

## Install (developer mode)

### Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the repo root folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `firefox/manifest.json`

## Usage

1. Open tabs with images (one image per tab, image-only pages)
2. Click the TabScreenShotter icon in the toolbar
3. Chrome: select your save folder. Firefox: files save to Downloads/TabScreenShotter/
4. Click "Start Capture"
5. Wait for processing to complete

## Incognito / Private Browsing

Both versions declare `"incognito": "spanning"`. To enable:

- **Chrome**: go to `chrome://extensions`, find TabScreenShotter, click Details, toggle "Allow in Incognito"
- **Firefox**: go to `about:addons`, find TabScreenShotter, click the toggle for "Run in Private Windows"

## Requirements

- Chrome 109+ / Edge 109+ / Firefox 109+
- Chrome version uses File System Access API for folder selection
- Firefox version saves to Downloads folder (no folder picker available)
