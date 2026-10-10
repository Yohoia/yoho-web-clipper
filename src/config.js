export const DEFAULT_SETTINGS = Object.freeze({
  apiBaseUrl: 'https://pagehush.yohoia.cn',
  webBaseUrl: 'https://pagehush.yohoia.cn',
});

export function normalizeBaseUrl(value) {
  const url = new URL(String(value).trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('线上服务请使用 HTTPS 地址；本机服务可以使用 HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('服务地址不能包含账号、密码、查询参数或锚点。');
  }
  return url.toString().replace(/\/+$/, '');
}

export function resolveSettings(stored) {
  // 0.1.0 shipped these development defaults without an explicit mode flag.
  const legacy = stored && !stored.version &&
    /^http:\/\/(127\.0\.0\.1|localhost):8787\/?$/.test(stored.apiBaseUrl || '') &&
    /^http:\/\/(127\.0\.0\.1|localhost):5173\/?$/.test(stored.webBaseUrl || '');
  if (!stored || legacy) return { ...DEFAULT_SETTINGS, version: 2 };
  return {
    apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
    webBaseUrl: normalizeBaseUrl(stored.webBaseUrl || DEFAULT_SETTINGS.webBaseUrl),
    version: 2,
  };
}

export function articleUrl(settings, article) {
  if (article.shortId && /^[0-9A-Za-z]{22}$/.test(article.shortId)) {
    return `${settings.webBaseUrl}/a/${article.shortId}`;
  }
  // Older PageHush APIs support UUID addresses but do not return shortId yet.
  const identifier = article.id || article.slug;
  return `${settings.webBaseUrl}/articles/${encodeURIComponent(identifier)}`;
}
