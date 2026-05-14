# TabScreenShotter

Chrome/Edge extension that screenshots every image tab in the current browser window.

## What it does

1. You click the extension icon
2. Pick a folder to save screenshots to
3. The extension iterates through every tab in the window
4. For each tab, it detects the image, crops the screenshot to the image bounds, and saves it as a PNG with a random 18-character alphanumeric filename

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this folder

## Usage

1. Open tabs with images (one image per tab, image-only pages)
2. Click the TabScreenShotter icon in the toolbar
3. Select your save folder
4. Click "Start Capture"
5. Wait for processing to complete

## Requirements

- Chrome 109+ or Edge 109+ (Manifest V3 + Offscreen API)
- File System Access API support (for folder picker)
