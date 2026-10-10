// Browser-only fixtures. This file is never referenced by the extension manifest or popup.
(() => {
  const state = new URLSearchParams(location.search).get('state') || 'login';
  // Explicit visual-test boundary: exercise the real copy UI without replacing the system clipboard.
  const clipboardFixture = new URLSearchParams(location.search).get('clipboardFixture');
  if (clipboardFixture) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(text) {
      if (clipboardFixture === 'error') throw new Error('fixture clipboard denied');
      window.__copiedText = text;
    } } });
    if (clipboardFixture === 'error') document.execCommand = () => false;
  }
  const key = 'yoho-preview';
  const saved = sessionStorage.getItem(`${key}-state`) === state
    ? JSON.parse(sessionStorage.getItem(`${key}-store`) || 'null') : null;
  sessionStorage.setItem(`${key}-state`, state);
  const token = { token: 'fixture-session', expiresAt: '2099-01-01T00:00:00.000Z', apiBaseUrl: 'https://pagehush.yohoia.cn' };
  const local = saved?.local || { ...(state === 'login' ? {} : { auth: token }) };
  const session = saved?.session || {};
  let messageListener;
  let ready;
  const readyPromise = new Promise((resolve) => { ready = resolve; });
  const listeners = [];
  const persist = () => sessionStorage.setItem(`${key}-store`, JSON.stringify({ local, session }));
  const store = (data, area) => ({
    async get(keys) { if (typeof keys === 'string') keys = [keys]; return Object.fromEntries((keys || Object.keys(data)).filter((key) => key in data).map((key) => [key, data[key]])); },
    async set(values) { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[key], newValue: value }; data[key] = value; } persist(); listeners.forEach((listener) => listener(changes, area)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; persist(); },
    async clear() { Object.keys(data).forEach((key) => delete data[key]); persist(); },
  });
  const fixture = {
    url: 'https://notes.example.com/reading/keep-the-good',
    captureUrl: 'https://notes.example.com/reading/keep-the-good',
    title: '把阅读变成自己的知识：建立一个有用的收藏习惯',
    description: '真正有价值的收藏，是在需要的时候，能重新找到它。',
    siteName: '阅读手记', siteIconUrl: null, coverUrl: null, author: '林间',
    sourcePublishedAt: '2026-10-08T00:00:00.000Z', language: 'zh',
    markdown: '## 给好内容一个去处\n\n真正有价值的收藏，是在需要的时候，能重新找到它。\n\n- 把值得重读的内容放在一起\n- 用分类建立自己的阅读线索\n- 给未来的自己留下一点上下文',
    hasSelection: true, wordCount: 1286, readingTimeMinutes: 4,
  };
  const article = { id: 'fixture-article', slug: 'reading-notes', title: fixture.title, topicId: 'topic-learning', topic: '学习' };
  if (!saved && state === 'success') local.saveJob = { status: 'success', tabId: 1, article, articleUrl: 'https://pagehush.yohoia.cn/articles/reading-notes' };
  window.chrome = {
    runtime: {
      id: 'preview-extension',
      getManifest() { return { version: '0.5.4' }; },
      getURL(path) { return `chrome-extension://preview-extension/${path}`; },
      onMessage: { addListener(listener) { messageListener = listener; ready(); } },
      async sendMessage(message) { await readyPromise; return new Promise((resolve) => messageListener(message, { id: 'preview-extension', url: 'chrome-extension://preview-extension/popup/popup.html', ...(location.search.includes('surface=panel') ? { tab: { id: 1, url: fixture.url } } : {}) }, resolve)); },
    },
    storage: { local: store(local, 'local'), session: store(session, 'session'), onChanged: { addListener(listener) { listeners.push(listener); } } },
    tabs: {
      async query() { return [{ id: 1, url: fixture.url }]; },
      async get() { return { id: 1, windowId: 1, url: fixture.url }; },
      async captureVisibleTab() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII='; },
      async sendMessage(_id, message) {
        if (message.type === 'yohoClipper:closePagePanel') { parent.postMessage('shiye-preview-close', location.origin); return { ok: true }; }
        if (['yohoClipper:prepareScreenshot', 'yohoClipper:restoreScreenshot'].includes(message.type)) return { ok: true };
        return { ok: true, data: { ...fixture, clipType: message.clipType, ...(message.clipType === 'bookmark' ? { markdown: `> ${fixture.description}`, wordCount: 35 } : {}) } };
      },
      async create(options) {
        window.__openedUrl = options.url;
      },
    },
    scripting: { async executeScript() {} },
    action: { onClicked: { addListener() {} }, async setBadgeText() {}, async setTitle() {} },
  };
  const originalFetch = window.fetch.bind(window);
  window.__fixtureRequests = [];
  window.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://pagehush.yohoia.cn')) return originalFetch(url, options);
    window.__fixtureRequests.push({ url, body: options.body && !(options.body instanceof FormData) ? JSON.parse(options.body) : null });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const path = new URL(url).pathname;
    if (state === 'offline' && path !== '/v1/auth/login-extension') throw new TypeError('Failed to fetch');
    if (path === '/v1/auth/login-extension') {
      if (JSON.parse(options.body).accessCode !== '123456') return Response.json({ error: 'invalid_access_code' }, { status: 401 });
      return Response.json({ authenticated: true, sessionToken: token.token, expiresAt: token.expiresAt }, { status: 201 });
    }
    if (path === '/v1/auth/session') return Response.json({ authenticated: true });
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    if (path === '/v1/tags') return Response.json([{ id: 'reading', name: '阅读' }, { id: 'idea', name: '灵感' }, { id: 'later', name: '稍后重读' }]);
    if (path === '/v1/topics') return Response.json(state === 'empty' ? [] : [{ id: 'topic-design', name: '设计', articleCount: 8 }, { id: 'topic-learning', name: '学习', articleCount: 24 }, { id: 'topic-life', name: '日常', articleCount: 3 }]);
    if (path === '/v1/assets') return Response.json({ id: 'fixture-capture', status: 'ready', url: '/v1/assets/fixture-capture/content' }, { status: 201 });
    if (path === '/v1/articles') {
      if (state === 'saving') await new Promise((resolve) => setTimeout(resolve, 10_000));
      if (state === 'save-flow') await new Promise((resolve) => setTimeout(resolve, 500));
      if (state === 'save-error') return Response.json({ error: 'database_not_configured' }, { status: 503 });
      const payload = JSON.parse(options.body);
      return Response.json({ ...article, ...payload, topicId: payload.topicId || 'topic-new', topic: payload.topicName || (payload.topicId === 'topic-design' ? '设计' : '学习') }, { status: 201 });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  if (new URLSearchParams(location.search).get('view') === 'about') {
    document.addEventListener('DOMContentLoaded', () => {
      const observer = new MutationObserver(() => {
        if (document.getElementById('clipPanel').hidden || document.getElementById('clipButton').disabled) return;
        observer.disconnect();
        document.getElementById('aboutButton').click();
      });
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
    });
  }
  if (new URLSearchParams(location.search).get('autoclip') === '1') {
    document.addEventListener('DOMContentLoaded', () => {
      const begin = () => {
        const button = document.getElementById('clipButton');
        if (!button || button.disabled) return;
        observer.disconnect();
        setTimeout(() => button.click(), 300);
      };
      const observer = new MutationObserver(begin);
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
      begin();
    });
  }
})();
