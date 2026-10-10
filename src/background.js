import { articleUrl, normalizeBaseUrl, resolveSettings } from './config.js';

const PREFIX = 'yohoClipper:';
let saving = false;

const MAX_ARCHIVED_IMAGES = 30;
const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_ARCHIVED_IMAGE_TOTAL_SIZE = 50 * 1024 * 1024;
const IMAGE_MARKDOWN_PATTERN = /!\[((?:\\.|[^\]])*)\]\(([^)\s]+)(?:\s+(\"(?:[^\"\\]|\\.)*\"))?\)/g;
const inlineAssetCache = new Map();
const IMAGE_MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

function outsideCodeFence(value, callback) {
  let fence = null;
  return value.split('\n').map((line) => {
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker && (!fence || marker[1].startsWith(fence))) {
      fence = fence ? null : marker[1];
      return line;
    }
    if (fence) return line;
    return callback(line);
  }).join('\n');
}

function inlineImageUrls(content) {
  const urls = [];
  const seen = new Set();
  outsideCodeFence(content, (line) => {
    for (const match of line.matchAll(IMAGE_MARKDOWN_PATTERN)) {
      const url = match[2];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  });
  return urls.slice(0, MAX_ARCHIVED_IMAGES);
}

function imageFilename(url, mimeType) {
  const parsed = new URL(url);
  const raw = decodeURIComponent(parsed.pathname.split('/').at(-1) || 'image');
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
  const extension = IMAGE_MIME_EXTENSIONS.get(mimeType) || '';
  if (!safe || !/\.(jpe?g|png|webp)$/i.test(safe)) return `pagehush-image${extension}`;
  return safe.slice(-100);
}

async function uploadInlineImage(url, state, kind = 'inline_image', remainingSize = MAX_ARCHIVED_IMAGE_TOTAL_SIZE) {
  const cacheKey = `${state.settings.apiBaseUrl}|${url}`;
  if (inlineAssetCache.has(cacheKey)) return inlineAssetCache.get(cacheKey);
  let response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const mimeType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!IMAGE_MIME_EXTENSIONS.has(mimeType)) return null;
  let blob;
  try { blob = await response.blob(); } catch { return null; }
  if (!blob.size || blob.size > MAX_INLINE_IMAGE_SIZE || blob.size > remainingSize) return null;

  const form = new FormData();
  form.append('kind', kind);
  form.append('file', blob, imageFilename(url, mimeType));
  try {
    const asset = await request('/v1/assets', { method: 'POST', body: form }, state);
    if (!asset?.id || asset.status !== 'ready' || asset.url !== `/v1/assets/${asset.id}/content`) return null;
    inlineAssetCache.set(cacheKey, asset);
    return asset;
  } catch {
    return null;
  }
}

async function archivePayloadImages(payload, state) {
  if (!['article', 'selection', 'full_page'].includes(payload.clipType)) return payload;
  const assets = new Map();
  const archived = new Map();
  let remainingImageBytes = MAX_ARCHIVED_IMAGE_TOTAL_SIZE;

  for (const url of inlineImageUrls(payload.content)) {
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    if (url.startsWith(`${state.settings.apiBaseUrl}/v1/assets/`)) continue;
    const asset = await uploadInlineImage(url, state, 'inline_image', remainingImageBytes);
    if (!asset) continue;
    remainingImageBytes -= asset.size;
    assets.set(url, asset);
    archived.set(url, `${state.settings.apiBaseUrl}${asset.url}`);
  }

  if (!archived.size) return payload;
  const content = outsideCodeFence(payload.content, (line) =>
    line.replace(IMAGE_MARKDOWN_PATTERN, (match, alt, url, title = '') => {
      const replacement = archived.get(url);
      return replacement ? `![${alt}](${replacement}${title ? ` ${title}` : ''})` : match;
    }),
  );

  const coverAsset = payload.cover ? assets.get(payload.cover) : null;
  return {
    ...payload,
    content,
    ...(coverAsset ? { coverAssetId: coverAsset.id, cover: null } : {}),
  };
}

function fail(code, status = 0) {
  return Object.assign(new Error(code), { code, status });
}

async function clearAuth() {
  await chrome.storage.local.remove('auth');
  await chrome.storage.session.remove('auth');
}

async function getState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['settings', 'auth', 'lastTopic', 'saveJob']),
    chrome.storage.session.get('auth'),
  ]);
  const settings = resolveSettings(local.settings);
  const migrated = local.settings?.apiBaseUrl && settings.apiBaseUrl !== local.settings.apiBaseUrl;
  await chrome.storage.local.set({ settings });
  let auth = session.auth || local.auth || null;
  if (auth && (migrated || (auth.apiBaseUrl && auth.apiBaseUrl !== settings.apiBaseUrl) ||
    !auth.token || !auth.expiresAt || new Date(auth.expiresAt).getTime() <= Date.now() ||
    !Number.isFinite(new Date(auth.expiresAt).getTime()))) {
    await clearAuth();
    auth = null;
  }
  if (auth && !auth.apiBaseUrl) {
    auth = { ...auth, apiBaseUrl: settings.apiBaseUrl };
    await (session.auth ? chrome.storage.session : chrome.storage.local).set({ auth });
  }
  let saveJob = migrated ? null : local.saveJob || null;
  if (saveJob?.status === 'success' && saveJob.article) {
    saveJob = { ...saveJob, articleUrl: articleUrl(settings, saveJob.article) };
  }
  if (migrated) await chrome.storage.local.remove(['lastTopic', 'saveJob']);
  if (saveJob?.status === 'saving' && Date.now() - saveJob.startedAt > 90_000) {
    saveJob = { ...saveJob, status: 'error', error: 'save_interrupted' };
    await chrome.storage.local.set({ saveJob });
  }
  return { settings, auth, lastTopic: migrated ? null : local.lastTopic, saveJob };
}

async function request(path, options = {}, state) {
  const { settings, auth } = state || await getState();
  let response;
  try {
    response = await fetch(`${settings.apiBaseUrl}${path}`, {
      ...options,
      credentials: 'omit',
      signal: AbortSignal.timeout(25_000),
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(auth?.token ? { 'x-pagehush-session': auth.token } : {}),
      },
    });
  } catch (error) {
    throw fail(['TimeoutError', 'AbortError'].includes(error.name) ? 'request_timeout' : 'network_error');
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/v1/auth/login-extension') await clearAuth();
    throw fail(result?.error || `http_${response.status}`, response.status);
  }
  if (response.status !== 204 && !result) throw fail('invalid_response');
  return result;
}

async function login(message) {
  if (!/^\d{6}$/.test(message.accessCode || '')) throw fail('invalid_code_format');
  const state = await getState();
  const result = await request('/v1/auth/login-extension', {
    method: 'POST',
    body: JSON.stringify({ accessCode: message.accessCode, remember: Boolean(message.remember) }),
  }, { ...state, auth: null });
  if (!result.authenticated || !result.sessionToken ||
    !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) {
    throw fail('invalid_response');
  }
  const auth = {
    token: result.sessionToken,
    expiresAt: result.expiresAt,
    apiBaseUrl: state.settings.apiBaseUrl,
  };
  await clearAuth();
  await (message.remember ? chrome.storage.local : chrome.storage.session).set({ auth });
  return { authenticated: true, expiresAt: auth.expiresAt };
}

async function screenshotPayload(message, state) {
  const tab = await chrome.tabs.get(message.tabId);
  const expectedUrl = message.captureUrl;
  const isSourceActive = async () => {
    const [current] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (!expectedUrl || current?.id !== tab.id || current.url !== expectedUrl || !/^https?:/.test(expectedUrl)) throw fail('capture_tab_changed');
  };
  await isSourceActive();
  let image;
  try {
    const prepared = await chrome.tabs.sendMessage(tab.id, { type: `${PREFIX}prepareScreenshot` }, { frameId: 0 });
    if (!prepared?.ok) throw fail('capture_failed');
    await isSourceActive();
    image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await isSourceActive();
  } catch (error) {
    throw error.code ? error : fail('capture_failed');
  } finally {
    await chrome.tabs.sendMessage(tab.id, { type: `${PREFIX}restoreScreenshot` }, { frameId: 0 }).catch(() => {});
  }
  if (!image?.startsWith('data:image/png;base64,')) throw fail('capture_failed');
  const blob = await (await fetch(image)).blob();
  if (blob.size > 5 * 1024 * 1024) throw fail('capture_too_large');
  const form = new FormData();
  form.append('kind', 'cover');
  form.append('file', blob, 'pagehush-screenshot.png');
  const asset = await request('/v1/assets', { method: 'POST', body: form }, state);
  if (!asset?.id || asset.status !== 'ready' || asset.url !== `/v1/assets/${asset.id}/content`) throw fail('invalid_response');
  const url = `${state.settings.apiBaseUrl}${asset.url}`;
  return { ...message.payload, content: `${message.payload.content}\n\n![网页截图](${url})`, coverAssetId: asset.id, cover: null, wordCount: 0, readingTimeMinutes: 0 };
}

async function createArticle(message) {
  if (saving) throw fail('save_in_progress');
  // Lock before any await so two simultaneous popup requests cannot both save.
  saving = true;
  let job;
  try {
    const state = await getState();
    if (!state.auth) throw fail('unauthorized', 401);
    let payload = message.payload;
    if (!payload?.title?.trim() || !['article', 'selection', 'bookmark', 'full_page', 'simplified', 'screenshot'].includes(payload.clipType) ||
      typeof payload.content !== 'string' || payload.content.length > 510_000) {
      throw fail('invalid_clip');
    }
    if (payload.tagNames !== undefined && (!Array.isArray(payload.tagNames) || payload.tagNames.length > 3 ||
      payload.tagNames.some((name) => typeof name !== 'string' || name.length > 40))) throw fail('invalid_tags');
    job = { status: 'saving', tabId: message.tabId, title: payload.title, startedAt: Date.now() };
    await chrome.storage.local.set({ saveJob: job });
    payload = await archivePayloadImages(payload, state);
    if (payload.clipType === 'screenshot') payload = await screenshotPayload(message, state);
    const bytes = new TextEncoder().encode(`${payload.sourceUrl || ''}\n${payload.content}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sourceChecksum = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const article = await request('/v1/articles', {
      method: 'POST', body: JSON.stringify({ ...payload, sourceChecksum }),
    }, state);
    if (!article?.id || !article.slug) throw fail('invalid_save_response');
    const url = articleUrl(state.settings, article);
    const lastTopic = article.topicId ? { id: article.topicId, name: article.topic } : message.topic;
    const summary = { id: article.id, shortId: article.shortId, slug: article.slug, title: article.title, topicId: article.topicId, topic: article.topic };
    let warning = null;
    try {
      // Persist only the result metadata, not another copy of the page content.
      await chrome.storage.local.set({
        saveJob: { ...job, status: 'success', article: summary, articleUrl: url }, lastTopic,
      });
      await chrome.storage.session.remove(`draft:${message.tabId}`);
    } catch {
      warning = '草稿已保存，但此设备未能记住保存结果。';
    }
    return { article: summary, articleUrl: url, warning };
  } catch (error) {
    if (job) await chrome.storage.local.set({ saveJob: { ...job, status: 'error', error: error.code || error.message } });
    throw error;
  } finally {
    saving = false;
  }
}

async function handle(message, sender) {
  switch (message.type) {
    case `${PREFIX}getContext`: return { tab: /^https?:/.test(sender.tab?.url || '') ? sender.tab : null };
    case `${PREFIX}closePanel`: {
      if (sender.tab?.id && /^https?:/.test(sender.tab.url || '')) {
        await chrome.tabs.sendMessage(sender.tab.id, { type: `${PREFIX}closePagePanel` }, { frameId: 0 });
      }
      return {};
    }
    case `${PREFIX}getState`: {
      const state = await getState();
      // Only the worker uses the token; the popup gets authentication metadata.
      return { ...state, auth: state.auth ? { authenticated: true, expiresAt: state.auth.expiresAt } : null };
    }
    case `${PREFIX}login`: return login(message);
    case `${PREFIX}session`: {
      const result = await request('/v1/auth/session');
      if (!result.authenticated) { await clearAuth(); throw fail('unauthorized', 401); }
      return result;
    }
    case `${PREFIX}topics`: {
      const result = await request('/v1/topics');
      if (!Array.isArray(result) || result.some((topic) => !topic.id || !topic.name)) throw fail('invalid_response');
      return { topics: result };
    }
    case `${PREFIX}tags`: {
      const result = await request('/v1/tags');
      if (!Array.isArray(result) || result.some((tag) => typeof tag.name !== 'string')) throw fail('invalid_response');
      return { tags: result };
    }
    case `${PREFIX}logout`: {
      if (saving) throw fail('save_in_progress');
      let serverError = null;
      try { await request('/v1/auth/logout', { method: 'DELETE' }); }
      catch (error) { serverError = error.code || error.message; }
      await clearAuth();
      await chrome.storage.session.clear();
      await chrome.storage.local.remove('saveJob');
      return { serverError };
    }
    case `${PREFIX}saveSettings`: {
      if (saving) throw fail('save_in_progress');
      const state = await getState();
      const settings = {
        apiBaseUrl: normalizeBaseUrl(message.settings.apiBaseUrl),
        webBaseUrl: normalizeBaseUrl(message.settings.webBaseUrl), version: 2,
      };
      const changed = settings.apiBaseUrl !== state.settings.apiBaseUrl || settings.webBaseUrl !== state.settings.webBaseUrl;
      if (changed) {
        try { if (state.auth) await request('/v1/auth/logout', { method: 'DELETE' }, state); } catch { /* Remove local credentials regardless. */ }
        await clearAuth();
        await chrome.storage.session.clear();
        await chrome.storage.local.remove(['lastTopic', 'saveJob']);
      }
      await chrome.storage.local.set({ settings });
      return { settings, changed };
    }
    case `${PREFIX}createArticle`: {
      if (/^https?:/.test(sender.tab?.url || '') && sender.tab.id !== message.tabId) throw fail('invalid_clip');
      return createArticle(message);
    }
    default: throw fail('unknown_message');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type?.startsWith(PREFIX) || message.type === `${PREFIX}extract`) return false;
  if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('popup/popup.html')) return false;
  handle(message, sender).then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, status: error.status || 0, error: error.code || error.message }));
  return true;
});

async function togglePagePanel(tab) {
  try {
    if (!tab.id || !/^https?:/.test(tab.url || '') || /^https?:\/\/chrome(webstore\.google\.com|\.google\.com\/webstore)/.test(tab.url)) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
      await chrome.action.setTitle({ tabId: tab.id, title: '拾页 · 请在普通网页上打开剪藏工具' });
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/panel.js'] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: '拾页 · 保存到页息 PageHush' });
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: '拾页 · 无法打开面板，请刷新网页后重试' });
  }
}
chrome.action.onClicked.addListener(togglePagePanel);
