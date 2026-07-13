const $ = (id) => document.getElementById(id);

// ---- load saved state --------------------------------------------------
chrome.storage.local
  .get(['apiKey', 'model', 'proxyToken', 'creditsRemaining'])
  .then(({ apiKey, model, proxyToken, creditsRemaining }) => {
    if (apiKey) $('apiKey').value = apiKey;
    if (model) $('model').value = model;
    if (proxyToken) $('proxyToken').value = proxyToken;
    showCredits(creditsRemaining);
  });

function showCredits(credits) {
  $('creditsRemaining').textContent =
    typeof credits === 'number' ? `Credits remaining: ${credits}` : '';
}

// ---- current keyboard shortcuts ----------------------------------------
chrome.commands.getAll().then((commands) => {
  const list = $('shortcuts');
  list.textContent = '';
  for (const c of commands) {
    if (!c.description) continue; // built-in _execute_action has none
    const li = document.createElement('li');
    if (c.shortcut) {
      const kbd = document.createElement('kbd');
      kbd.textContent = c.shortcut;
      li.append(kbd, ` — ${c.description}`);
    } else {
      // Chrome silently drops a suggested key when another extension owns
      // it; say so instead of letting the user press a dead chord.
      li.textContent = `No shortcut assigned — ${c.description}`;
    }
    list.appendChild(li);
  }
});

// ---- show/hide secrets ---------------------------------------------------
$('showApiKey').addEventListener('change', (e) => {
  $('apiKey').type = e.target.checked ? 'text' : 'password';
});
$('showProxyToken').addEventListener('change', (e) => {
  $('proxyToken').type = e.target.checked ? 'text' : 'password';
});

// ---- test buttons --------------------------------------------------------
async function runTest(mode, inputId, resultId) {
  const value = $(inputId).value.trim();
  const result = $(resultId);
  if (!value) {
    result.textContent = 'Nothing to test — the field is empty.';
    return;
  }
  result.textContent = 'Testing…';
  const response = await chrome.runtime.sendMessage({ type: 'test-connection', mode, value });
  result.textContent = response?.message || 'No response from the extension.';
  if (typeof response?.credits === 'number') showCredits(response.credits);
}

$('testApiKey').addEventListener('click', () => runTest('apiKey', 'apiKey', 'apiKeyResult'));
$('testProxyToken').addEventListener('click', () =>
  runTest('proxyToken', 'proxyToken', 'proxyTokenResult')
);

// ---- save ----------------------------------------------------------------
$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    model: $('model').value,
    proxyToken: $('proxyToken').value.trim(),
  });
  $('status').textContent = 'Saved.';
  setTimeout(() => ($('status').textContent = ''), 3000);
});
