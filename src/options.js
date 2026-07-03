const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const proxyTokenInput = document.getElementById('proxyToken');
const proxyUrlInput = document.getElementById('proxyUrl');
const status = document.getElementById('status');

chrome.storage.local
  .get(['apiKey', 'model', 'proxyToken', 'proxyUrl'])
  .then(({ apiKey, model, proxyToken, proxyUrl }) => {
    if (apiKey) apiKeyInput.value = apiKey;
    if (model) modelSelect.value = model;
    if (proxyToken) proxyTokenInput.value = proxyToken;
    if (proxyUrl) proxyUrlInput.value = proxyUrl;
  });

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    proxyToken: proxyTokenInput.value.trim(),
    proxyUrl: proxyUrlInput.value.trim(),
  });
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 3000);
});
