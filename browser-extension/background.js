import { createBackground } from './background-core.js';

const bridge = createBackground(chrome);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  bridge.handle(message, sender).then(sendResponse).catch(() => sendResponse(undefined));
  return true;
});
