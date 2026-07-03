// Injection guard: lets the background worker detect an already-injected
// content script so repeat invocations don't stack duplicate listeners.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') sendResponse('pong');
});
