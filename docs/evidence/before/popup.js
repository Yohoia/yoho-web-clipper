const DEFAULT_SETTINGS = {
  apiBaseUrl: 'http://127.0.0.1:8787',
  webBaseUrl: 'http://127.0.0.1:5173',
};

const elements = {
  connectionStatus: document.querySelector('#connectionStatus'),
  settingsToggle: document.querySelector('#settingsToggle'),
  settingsPanel: document.querySelector('#settingsPanel'),
  apiBaseUrl: document.querySelector('#apiBaseUrl'),
  webBaseUrl: document.querySelector('#webBaseUrl'),
  saveSettings: document.querySelector('#saveSettings'),
  loginPanel: document.querySelector('#loginPanel'),
  loginForm: document.querySelector('#loginForm'),
  accessCode: document.querySelector('#accessCode'),
  remember: document.querySelector('#remember'),
  loginButton: document.querySelector('#loginButton'),
  clipPanel: document.querySelector('#clipPanel'),
  topicSelect: document.querySelector('#topicSelect'),
  newTopicName: document.querySelector('#newTopicName'),
  clipType: document.querySelector('#clipType'),
  pageTitle: document.querySelector('#pageTitle'),
  pageSource: document.querySelector('#pageSource'),
  clipButton: document.querySelector('#clipButton'),
  logoutButton: document.querySelector('#logoutButton'),
  successPanel: document.querySelector('#successPanel'),
  successMessage: document.querySelector('#successMessage'),
  openArticleButton: document.querySelector('#openArticleButton'),
  clipAnotherButton: document.querySelector('#clipAnotherButton'),
  errorPanel: document.querySelector('#errorPanel'),
};

let settings = { ...DEFAULT_SETTINGS };
let auth = null;
let topics = [];
let pageData = null;
let savedArticleUrl = null;

function normalizeBaseUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function showPanel(panel) {
  for (const key of ['settingsPanel', 'loginPanel', 'clipPanel', 'successPanel']) {
    elements[key].hidden = key !== panel;
  }
}

function showError(message) {
  elements.errorPanel.textContent = message;
  elements.errorPanel.hidden = false;
}

function clearError() {
  elements.errorPanel.textContent = '';
  elements.errorPanel.hidden = true;
}

function setConnection(text, state = '') {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.className = state;
}

async function loadStoredState() {
  const stored = await chrome.storage.local.get(['settings', 'auth', 'lastTopic']);
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  auth = stored.auth || null;
  elements.apiBaseUrl.value = settings.apiBaseUrl;
  elements.webBaseUrl.value = settings.webBaseUrl;
}

async function saveStoredState() {
  await chrome.storage.local.set({ settings, auth });
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(auth?.token ? { 'x-pagehush-session': auth.token } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${settings.apiBaseUrl}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error;
    throw error;
  }
  return payload;
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    throw new Error('当前页面不能被剪藏');
  }

  const send = () => chrome.tabs.sendMessage(tab.id, message);
  try {
    return await send();
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
    return await send();
  }
}

function renderTopics() {
  elements.topicSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = topics.length ? '请选择分类' : '学习（将自动创建）';
  elements.topicSelect.append(defaultOption);

  for (const topic of topics) {
    const option = document.createElement('option');
    option.value = topic.id;
    option.textContent = `${topic.name}（${topic.articleCount}）`;
    elements.topicSelect.append(option);
  }

  const stored = chrome.storage.local.get(['lastTopic']).then((value) => {
    if (value.lastTopic?.id) elements.topicSelect.value = value.lastTopic.id;
    else if (value.lastTopic?.name) elements.newTopicName.value = value.lastTopic.name;
  });
  return stored;
}

async function refreshPageData() {
  const response = await sendToActiveTab({ type: 'yohoClipper:extract', clipType: 'article' });
  if (!response?.ok) throw new Error(response?.error || '无法解析当前页面');
  pageData = response.data;
  elements.pageTitle.textContent = pageData.title;
  elements.pageSource.textContent = pageData.siteName || new URL(pageData.url).hostname;
  const selectionOption = elements.clipType.querySelector('option[value="selection"]');
  selectionOption.disabled = !pageData.hasSelection;
  selectionOption.textContent = pageData.hasSelection ? '选中内容' : '选中内容（请先选择文字）';
}

async function initializeClipper() {
  if (!auth?.token || (auth.expiresAt && new Date(auth.expiresAt).getTime() <= Date.now())) {
    auth = null;
    await saveStoredState();
    showPanel('loginPanel');
    setConnection('请输入 PageHush 访问码');
    return;
  }

  try {
    const session = await apiRequest('/v1/auth/session');
    if (!session?.authenticated) throw Object.assign(new Error('unauthorized'), { status: 401 });
    const topicResponse = await apiRequest('/v1/topics');
    topics = Array.isArray(topicResponse) ? topicResponse : [];
    await renderTopics();
    await refreshPageData();
    showPanel('clipPanel');
    setConnection(`已连接 · ${new URL(settings.apiBaseUrl).host}`, 'ok');
  } catch (error) {
    if (error.status === 401) {
      auth = null;
      await saveStoredState();
      showPanel('loginPanel');
      setConnection('登录已失效，请重新输入访问码', 'error');
    } else {
      showPanel('loginPanel');
      setConnection('PageHush 连接失败', 'error');
      showError(`无法连接 PageHush：${error.message}`);
    }
  }
}

elements.settingsToggle.addEventListener('click', () => {
  elements.settingsPanel.hidden = !elements.settingsPanel.hidden;
});

elements.saveSettings.addEventListener('click', async () => {
  clearError();
  settings = {
    apiBaseUrl: normalizeBaseUrl(elements.apiBaseUrl.value, DEFAULT_SETTINGS.apiBaseUrl),
    webBaseUrl: normalizeBaseUrl(elements.webBaseUrl.value, DEFAULT_SETTINGS.webBaseUrl),
  };
  elements.apiBaseUrl.value = settings.apiBaseUrl;
  elements.webBaseUrl.value = settings.webBaseUrl;
  await saveStoredState();
  await initializeClipper();
});

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = '正在登录…';

  try {
    const response = await fetch(`${settings.apiBaseUrl}/v1/auth/login-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessCode: elements.accessCode.value.trim(),
        remember: elements.remember.checked,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);

    auth = {
      token: payload.sessionToken,
      expiresAt: payload.expiresAt,
    };
    elements.accessCode.value = '';
    await saveStoredState();
    await initializeClipper();
  } catch (error) {
    setConnection('登录失败', 'error');
    showError(error.message === 'invalid_access_code' ? '访问码不正确' : `登录失败：${error.message}`);
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = '登录 PageHush';
  }
});

elements.logoutButton.addEventListener('click', async () => {
  clearError();
  try {
    await apiRequest('/v1/auth/logout', { method: 'DELETE' });
  } catch {
    // A failed server logout should still clear the local extension token.
  }
  auth = null;
  await saveStoredState();
  showPanel('loginPanel');
  setConnection('已退出登录');
});

function markdownLinkText(value) {
  return String(value || '').replace(/([\]\[])/g, '\\$1');
}

function markdownLinkUrl(value) {
  return String(value || '').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function sourceHeader(data) {
  const lines = [
    `> 原文：[${markdownLinkText(data.title)}](${markdownLinkUrl(data.url)})`,
  ];
  const meta = [data.siteName, data.author, data.sourcePublishedAt?.slice(0, 10)].filter(Boolean);
  if (meta.length) lines.push(`> 来源：${meta.join(' · ')}`);
  return lines.join('\n');
}

elements.clipButton.addEventListener('click', async () => {
  clearError();
  const clipType = elements.clipType.value;
  if (clipType === 'selection' && !pageData?.hasSelection) {
    showError('请先在网页中选中文字');
    return;
  }

  elements.clipButton.disabled = true;
  elements.clipButton.textContent = '正在剪藏…';
  try {
    const response = await sendToActiveTab({ type: 'yohoClipper:extract', clipType });
    if (!response?.ok) throw new Error(response?.error || '无法解析当前页面');
    const data = response.data;
    const newTopicName = elements.newTopicName.value.trim();
    const topicId = !newTopicName ? elements.topicSelect.value : null;
    if (!newTopicName && !topicId && !topics.length) {
      throw new Error('请选择分类或输入新分类名');
    }

    const body = [sourceHeader(data), data.markdown].filter(Boolean).join('\n\n');
    const payload = {
      title: data.title,
      description: data.description || body.replace(/^>\s.*$/gm, '').slice(0, 500),
      content: body,
      format: 'md',
      status: 'draft',
      language: data.language,
      author: data.author || 'Yohoia',
      topicId: topicId || null,
      topicName: newTopicName || (topics.length ? null : '学习'),
      cover: data.coverUrl?.slice(0, 1000) || null,
      coverAlt: data.title,
      tagNames: [],
      sourceUrl: data.url.slice(0, 2048),
      sourceSiteName: data.siteName,
      sourceSiteIconUrl: data.siteIconUrl?.slice(0, 1000) || null,
      sourcePublishedAt: data.sourcePublishedAt,
      clipType,
      wordCount: data.wordCount,
      readingTimeMinutes: data.readingTimeMinutes,
    };

    const result = await chrome.runtime.sendMessage({
      type: 'yohoClipper:createArticle',
      payload,
    });
    if (!result?.ok) throw new Error(result?.error || '保存失败');

    savedArticleUrl = result.articleUrl;
    await chrome.storage.local.set({
      lastTopic: newTopicName
        ? { name: newTopicName }
        : topicId
          ? { id: topicId, name: elements.topicSelect.selectedOptions[0]?.textContent.replace(/（\d+）$/, '') || null }
          : { name: '学习' },
    });
    elements.successMessage.textContent = `已保存为草稿：${result.article.title}`;
    showPanel('successPanel');
  } catch (error) {
    if (error.message === 'unauthorized' || error.status === 401) {
      auth = null;
      await saveStoredState();
      showPanel('loginPanel');
      setConnection('登录已失效，请重新输入访问码', 'error');
    }
    showError(error.message === 'Failed to fetch' ? '无法连接 PageHush，请检查 API 地址' : error.message);
  } finally {
    elements.clipButton.disabled = false;
    elements.clipButton.textContent = '剪藏到 PageHush';
  }
});

elements.openArticleButton.addEventListener('click', async () => {
  if (savedArticleUrl) await chrome.tabs.create({ url: savedArticleUrl });
});

elements.clipAnotherButton.addEventListener('click', async () => {
  clearError();
  try {
    await refreshPageData();
    showPanel('clipPanel');
  } catch (error) {
    showError(error.message);
  }
});

loadStoredState().then(initializeClipper).catch((error) => {
  setConnection('初始化失败', 'error');
  showError(error.message);
});
