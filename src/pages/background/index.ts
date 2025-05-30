/**
 * Background script for New Tab Text Chrome extension
 */
chrome.runtime.onInstalled.addListener(() => {
  console.info("New Tab Text extension installed");
});

// Set up listener for tab synchronization
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.newTabText) {
    console.info("New Tab Text content changed and synced");
  }
});

// Keep service worker active
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "keepAlive") {
    sendResponse({ status: "alive" });
  }
  return true;
});
