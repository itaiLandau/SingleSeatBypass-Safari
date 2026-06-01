// Safari Service Worker background script
// This runs persistently to handle any background tasks

// Listen for tab updates (optional - for future enhancements)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Optional: Add any background tab logic here
});