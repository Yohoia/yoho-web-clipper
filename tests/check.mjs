import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleUrl, DEFAULT_SETTINGS, normalizeBaseUrl, resolveSettings } from '../src/config.js';
import { DEFAULT_PREFERENCES, resolvePreferences } from '../src/preferences.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = require(resolve(root, '../PageHush/node_modules/playwright')); }
const { chromium } = playwright;
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, '拾页');
assert.deepEqual(manifest.options_ui, { page: 'options/settings.html', open_in_tab: true });
assert.deepEqual(resolvePreferences({ defaultClipType: 'invalid', topicStrategy: 'unknown', afterClip: 'destroy', reduceMotion: 'yes' }), DEFAULT_PREFERENCES);
for (const file of ['src/background.js', 'src/content.js', 'src/config.js', 'src/panel.js', 'popup/popup.js', 'tests/panel-preview.js', 'options/settings.js', 'src/preferences.js', 'src/about.js']) execFileSync(process.execPath, ['--check', resolve(root, file)]);
assert.equal(resolveSettings({ apiBaseUrl: 'http://127.0.0.1:8787', webBaseUrl: 'http://127.0.0.1:5173' }).apiBaseUrl, DEFAULT_SETTINGS.apiBaseUrl);
assert.equal(resolveSettings({ version: 2, apiBaseUrl: 'http://127.0.0.1:8787', webBaseUrl: 'http://127.0.0.1:5173' }).apiBaseUrl, 'http://127.0.0.1:8787');
for (const url of ['javascript:alert(1)', 'https://name:password@example.com', 'http://example.com', 'https://example.com/?token=secret']) assert.throws(() => normalizeBaseUrl(url));
console.log('PASS: syntax, manifest, online defaults, migration and URL validation');
assert.equal(articleUrl(DEFAULT_SETTINGS, { shortId: '5SkpM6nZl2Q8vR9bX1cY0d', id: 'uuid', slug: '中文标题' }), `${DEFAULT_SETTINGS.webBaseUrl}/a/5SkpM6nZl2Q8vR9bX1cY0d`);
assert.equal(articleUrl(DEFAULT_SETTINGS, { id: '95ad948e-3101-45f4-8b5c-646c3b988251', slug: '中文标题' }), `${DEFAULT_SETTINGS.webBaseUrl}/articles/95ad948e-3101-45f4-8b5c-646c3b988251`);

const requests = [];
const articles = [];
let failSave = false;
let failAsset = false;
let failTopics = false;
let emptyTopics = false;
let validSession = true;
let saveDelay = 0;
const uploadedAssets = [];
const remoteImageRequests = [];
const pngFixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+gv2kAAAAASUVORK5CYII=', 'base64');
const fixture = `<!doctype html><html lang="en"><head><title>A thoughtful reading workflow</title><meta name="author" content="Reader"><meta name="description" content="Keep useful ideas with their original context."></head><body><nav>REMOVE NAVIGATION</nav><article><h1>A thoughtful reading workflow</h1><p>Keep <strong>useful ideas</strong> and a <a href="/original">source link</a>.</p><h2>Reading list</h2><ol start="3"><li>Read slowly<ul><li>Take a note</li><li>Keep context</li></ul></li><li>Return later</li></ol><pre><code>function example() {\n    const spaces = 'a  b';\n\n\n    return spaces;\n}</code></pre><p>Inline <code>a\`b</code> and &lt;img src=x onerror=alert(1)&gt;</p><img src="/cover.png" alt="Reading [notes]"><img src="/inline.png" alt="Inline notes"><a href="javascript:alert(1)">Unsafe link</a><div style="display:none">SECRET HIDDEN</div><form><input value="DO NOT SAVE FORM"></form><script>window.fixtureLoaded=true</script><table><tr><th>Name</th><th>Idea</th></tr><tr><td>Read</td><td>Keep | context</td></tr></table></article><footer>REMOVE FOOTER</footer></body></html>`;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/fixture' || path.startsWith('/articles/') || path.startsWith('/a/') || path.startsWith('/workspace/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fixture); return; }
  if (path === '/cover.png' || path === '/inline.png') {
    remoteImageRequests.push({ path, referer: req.headers.referer || null });
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(pngFixture); return;
  }
  if (!path.startsWith('/v1/')) { res.writeHead(204); res.end(); return; }
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = body && path !== '/v1/assets' ? JSON.parse(body) : null;
  requests.push({ path, method: req.method, data, token: req.headers['x-pagehush-session'] });
  const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (path === '/v1/auth/login-extension') {
    if (data?.accessCode !== '123456') { send({ error: 'invalid_access_code' }, 401); return; }
    validSession = true;
    send({ authenticated: true, sessionToken: 'test-session-token', expiresAt: '2099-01-01T00:00:00.000Z' }, 201); return;
  }
  if (path === '/v1/auth/logout') { validSession = false; res.writeHead(204); res.end(); return; }
  const valid = validSession && req.headers['x-pagehush-session'] === 'test-session-token';
  if (path === '/v1/auth/session') { send({ authenticated: valid }); return; }
  if (!valid) { send({ error: 'unauthorized' }, 401); return; }
  if (path === '/v1/topics') {
    if (failTopics) { send({ error: 'database_not_configured' }, 503); return; }
    send(emptyTopics ? [] : [{ id: 'learning', name: '学习', articleCount: 4 }, { id: 'design', name: '设计', articleCount: 2 }]); return;
  }
  if (path === '/v1/tags') { send([{ id: 'tag-read', name: '阅读' }, { id: 'tag-design', name: '设计灵感' }]); return; }
  if (path === '/v1/assets') {
    assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.ok(body.includes('name="kind"'));
    const screenshot = body.includes('filename="pagehush-screenshot.png"');
    const kind = screenshot ? 'cover' : 'inline_image';
    assert.ok(body.includes(`name="kind"`) && body.includes(kind));
    assert.ok(body.includes('image/png'));
    if (failAsset) { send({ error: 'storage_not_configured' }, 503); return; }
    const id = screenshot ? 'capture-asset' : `inline-asset-${uploadedAssets.length + 1}`;
    const asset = { id, status: 'ready', kind, size: pngFixture.length, url: `/v1/assets/${id}/content` };
    uploadedAssets.push(asset);
    send(asset, 201); return;
  }
  if (path === '/v1/articles') {
    if (saveDelay) await new Promise((resolve) => setTimeout(resolve, saveDelay));
    if (failSave) { send({ error: 'database_not_configured' }, 503); return; }
    if ('topicName' in data && typeof data.topicName !== 'string') { send({ error: 'Bad Request' }, 400); return; }
    const article = { ...data, id: `saved-${articles.length + 1}`, shortId: articles.length === 0 ? '5SkpM6nZl2Q8vR9bX1cY0d' : undefined, slug: `中文标题-${articles.length + 1}`, topicId: data.topicId || 'new-topic', topic: data.topicName || (data.topicId === 'design' ? '设计' : '学习') };
    articles.push(article); send(article, 201); return;
  }
  send({ error: 'not_found' }, 404);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const fixtureUrl = `${base}/fixture?campaign=reading&title=%E9%98%85%E8%AF%BB&ref=complete-link#paragraph-2`;
const profile = await mkdtemp(resolve(tmpdir(), 'yoho-clipper-test-'));
let context;
const wait = async (page, predicate) => page.waitForFunction(predicate, null, { timeout: 15_000 });
const visiblePanel = async (page, id) => wait(page, () => true).then(() => page.locator(`#${id}`).waitFor({ state: 'visible', timeout: 15_000 }));
const enterCode = async (page, value, index = 0) => {
  await page.locator('.code-digit').nth(index).evaluate((input, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text', text);
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, value);
};
const assertPopupSize = async (page) => {
  const size = await page.evaluate(() => {
    const html = document.documentElement.getBoundingClientRect();
    const body = document.body.getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return { htmlWidth: html.width, htmlHeight: html.height, bodyWidth: body.width, bodyHeight: body.height, mainBottom: main.bottom, overflow: getComputedStyle(document.querySelector('main')).overflowY };
  });
  assert.equal(size.htmlWidth, 340); assert.equal(size.bodyWidth, 340);
  assert.equal(size.htmlHeight, 600); assert.equal(size.bodyHeight, 600);
  assert.ok(size.mainBottom <= 600); assert.equal(size.overflow, 'auto');
};
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  const source = await context.newPage();
  await source.goto(fixtureUrl);
  await source.evaluate(() => {
    const p = document.querySelector('article p');
    const range = document.createRange(); range.selectNodeContents(p);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  // A popup opened as a test tab isn't the toolbar popup. Point only tabs.query
  // at the source tab; content scripts, worker, storage and HTTP remain real.
  await context.addInitScript(({ prefix, sourceUrl }) => {
    if (!location.href.startsWith(prefix)) return;
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = () => query({ url: sourceUrl.split('?')[0] + '*' });
  }, { prefix: `chrome-extension://${extensionId}/popup/`, sourceUrl: fixtureUrl });
  const popup = await context.newPage();
  const consoleErrors = [];
  popup.on('pageerror', (error) => consoleErrors.push(error.message));
  const state = await worker.evaluate(async () => { return await chrome.storage.local.get(null); });
  assert.ok(!state.auth);
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ settings: { apiBaseUrl: 'http://127.0.0.1:8787', webBaseUrl: 'http://127.0.0.1:5173' }, auth: { token: 'legacy', expiresAt: '2099-01-01T00:00:00.000Z' } });
  });
  await popup.goto(popupUrl);
  await visiblePanel(popup, 'loginPanel');
  await assertPopupSize(popup);
  for (const width of [80, 340, 1280]) {
    await popup.setViewportSize({ width, height: 900 });
    await assertPopupSize(popup);
  }
  await popup.setViewportSize({ width: 340, height: 600 });
  assert.equal(await popup.locator('h1').textContent(), '拾页');
  assert.equal(await popup.locator('.code-digit').count(), 6);
  assert.ok(Math.abs((await popup.locator('#codeDigit1').boundingBox()).height - 44) < .1);
  assert.equal(await popup.locator('#loginButton').isDisabled(), true);
  assert.equal(await popup.locator('.brand-mark').evaluate((image) => image.complete && image.naturalWidth === 128), true);
  assert.equal(await popup.locator('#settingsToggle, #settingsPanel, #apiBaseUrl, #webBaseUrl').count(), 0);
  assert.equal(await popup.locator('#clipPanel').isVisible(), false);
  assert.equal(requests.length, 0, 'opening an unauthenticated popup must not fetch content or API data');
  const migrated = await worker.evaluate(async () => chrome.storage.local.get(null));
  assert.equal(migrated.settings.apiBaseUrl, DEFAULT_SETTINGS.apiBaseUrl);
  assert.ok(!migrated.auth);
  await worker.evaluate(async ({ base }) => chrome.storage.local.set({ settings: { apiBaseUrl: base, webBaseUrl: base, version: 2 } }), { base });
  await popup.reload(); await visiblePanel(popup, 'loginPanel');
  await popup.locator('#codeDigit1').focus();
  await popup.keyboard.type('123');
  assert.equal(await popup.locator('#codeDigit1').inputValue(), '1');
  assert.equal(await popup.locator('#codeDigit3').inputValue(), '3');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'codeDigit4');
  assert.equal(await popup.locator('#loginButton').isDisabled(), true);
  await popup.keyboard.press('Backspace');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'codeDigit3');
  await popup.keyboard.press('Backspace');
  assert.equal(await popup.locator('#codeDigit3').inputValue(), '');
  await popup.keyboard.press('ArrowLeft');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'codeDigit2');
  await popup.keyboard.press('ArrowRight');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'codeDigit3');
  await popup.keyboard.type('x'); assert.equal(await popup.locator('#codeDigit3').inputValue(), '');
  await enterCode(popup, '00-00 00', 3);
  assert.equal(await popup.locator('#loginButton').isDisabled(), false);
  await popup.locator('#showCode').click();
  assert.equal(await popup.locator('#codeDigit1').getAttribute('type'), 'text');
  await popup.locator('#showCode').click();
  await popup.locator('#loginButton').click();
  await popup.locator('#errorMessage').filter({ hasText: '访问码不正确' }).waitFor();
  assert.equal(await popup.locator('#loginPanel').isVisible(), true);
  assert.equal(await popup.locator('#copyLinkButton').isVisible(), false);
  assert.equal(await popup.locator('#codeDigit1').inputValue(), '');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'codeDigit1');
  assert.equal(await popup.locator('#loginButton').isDisabled(), true);
  await enterCode(popup, '123456', 5); await popup.locator('#remember').uncheck(); await popup.locator('#loginButton').click();
  await visiblePanel(popup, 'clipPanel');
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  await assertPopupSize(popup);
  assert.equal(await popup.locator('#previewDetails, #contentPreview, select').count(), 0);
  assert.equal(await popup.locator('input[name="clipType"]').count(), 6);
  await wait(popup, () => !document.getElementById('clipPanel').getAnimations().some((animation) => animation.playState === 'running'));
  assert.equal(await popup.locator('#clipFooter').textContent().then((text) => text.includes('随时继续编辑')), false);
  const pagesBeforeAbout = context.pages().length;
  const popupAddress = popup.url();
  await popup.locator('#aboutButton').click();
  await visiblePanel(popup, 'aboutPanel');
  await assertPopupSize(popup);
  assert.equal(context.pages().length, pagesBeforeAbout);
  assert.equal(popup.url(), popupAddress);
  assert.equal(await popup.locator('#backToClipButton').isVisible(), true);
  assert.equal(await popup.locator('#copyLinkButton').isVisible(), false);
  assert.equal(await popup.locator('#clipFooter').isVisible(), false);
  assert.equal(await popup.locator('#aboutPanel #version').textContent(), manifest.version);
  await popup.locator('#backToClipButton').click();
  await visiblePanel(popup, 'clipPanel');
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'aboutButton');
  // Keep the browser extension-details options entry compatible as a secondary entry.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/settings.html`);
  options.on('pageerror', (error) => consoleErrors.push(error.message));
  await options.waitForURL(`chrome-extension://${extensionId}/options/settings.html*`);
  await options.locator('#version').filter({ hasText: manifest.version }).waitFor();
  assert.equal(await options.locator('h1').textContent(), '关于拾页');
  assert.equal(await popup.locator('#aboutButton').getAttribute('aria-label'), '关于拾页');
  assert.equal(await popup.locator('#aboutButton use').getAttribute('href'), '#i-info');
  assert.equal(await options.locator('form, input, nav, #saveStatus, #resetButton').count(), 0);
  assert.equal(await options.locator('.product-link').getAttribute('href'), 'https://pagehush.yohoia.cn/');
  assert.equal(await options.locator('.clip-kind').count(), 6);
  assert.equal((await options.locator('main').textContent()).includes('标签数量'), false);
  assert.ok((await options.locator('.facts').textContent()).includes('Markdown'));
  assert.ok((await options.locator('.facts').textContent()).includes('草稿'));
  const beforeAboutRead = await worker.evaluate(() => Promise.all([chrome.storage.local.get(), chrome.storage.session.get('auth')]));
  await options.reload();
  await options.locator('#version').filter({ hasText: manifest.version }).waitFor();
  assert.deepEqual(await worker.evaluate(() => Promise.all([chrome.storage.local.get(), chrome.storage.session.get('auth')])), beforeAboutRead);
  await options.close(); await popup.bringToFront();
  console.log('PASS: inline about stays in the same surface; browser options entry remains read-only with accurate info and unchanged storage');

  const modeRows = await popup.locator('.mode-option').evaluateAll((rows) => rows.map((row) => {
    const rect = row.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  assert.ok(modeRows.every((row) => row.x === modeRows[0].x && row.width === modeRows[0].width && row.height === 32));
  assert.ok(modeRows.slice(1).every((row, index) => row.y === modeRows[index].y + 32));
  assert.equal(await popup.locator('.mode-option input:checked + span .mode-check').evaluate((check) => getComputedStyle(check).opacity), '1');
  await popup.locator('input[value="article"]').focus(); await popup.keyboard.press('ArrowDown');
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('input[value="full_page"]').isChecked(), true);
  await popup.locator('input[value="article"]').check();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  console.log('PASS: compact vertical six-mode list, single checkmark and keyboard selection');
  await popup.evaluate(() => {
    window.__layoutSamples = []; window.__samplingLayout = true;
    const sample = () => {
      window.__layoutSamples.push({ scroll: document.querySelector('main').scrollTop, root: scrollY,
        positions: ['pagePreview', 'clipButton', 'topicTrigger'].map((id) => document.getElementById(id).getBoundingClientRect().y) });
      if (window.__samplingLayout) requestAnimationFrame(sample);
    };
    sample();
  });
  for (const type of ['full_page', 'simplified', 'selection', 'bookmark', 'screenshot', 'article']) {
    const box = await popup.locator(`label.mode-option:has(input[value="${type}"])`).boundingBox();
    await popup.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await wait(popup, () => !document.getElementById('clipButton').disabled);
  }
  const layoutSamples = await popup.evaluate(() => { window.__samplingLayout = false; return window.__layoutSamples; });
  assert.ok(layoutSamples.every((sample) => sample.scroll === layoutSamples[0].scroll && sample.root === 0));
  assert.ok(layoutSamples.every((sample) => sample.positions.every((y, index) => Math.abs(y - layoutSamples[0].positions[index]) < .5)));
  console.log('PASS: six-mode switches preserve layout and scroll across every async refresh frame');

  assert.equal(await popup.locator('#pageUrl').count(), 0);
  assert.equal(await popup.locator('#clipButton > span').textContent(), '剪藏');
  assert.equal(await popup.evaluate(() => {
    const title = document.querySelector('#pagePreview').getBoundingClientRect();
    const action = document.querySelector('#clipButton').getBoundingClientRect();
    const modes = document.querySelector('.mode-field').getBoundingClientRect();
    return title.bottom < action.top && action.bottom < modes.top;
  }), true);
  await popup.evaluate(() => {
    window.__copyFails = false; window.__fallbackSucceeds = false;
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text) => {
      if (window.__copyFails) throw new Error('platform denied'); window.__copiedText = text;
    } });
    document.execCommand = () => {
      window.__fallbackText = document.activeElement.value;
      return window.__fallbackSucceeds;
    };
  });
  await popup.locator('#copyLinkButton').click();
  await popup.locator('#copyLinkText').filter({ hasText: '已复制' }).waitFor();
  assert.equal(await popup.evaluate(() => window.__copiedText), fixtureUrl);
  await popup.evaluate(() => { window.__copyFails = true; });
  await popup.locator('#copyLinkButton').click();
  await popup.locator('#copyLinkText').filter({ hasText: '重试复制' }).waitFor();
  assert.equal(await popup.locator('textarea').count(), 0);
  await popup.evaluate(() => { window.__fallbackSucceeds = true; });
  await popup.locator('#copyLinkButton').click();
  await popup.locator('#copyLinkText').filter({ hasText: '已复制' }).waitFor();
  assert.equal(await popup.evaluate(() => window.__fallbackText), fixtureUrl);
  assert.equal(await popup.evaluate(() => document.activeElement.id), 'copyLinkButton');
  console.log('PASS: action placement, full source-link copy, denied-copy retry and fallback cleanup (platform clipboard mocked)');

  await popup.locator('#newTopicToggle').click();
  await assertPopupSize(popup);
  await popup.locator('#newTopicToggle').click();
  await popup.locator('main').evaluate((main) => { main.scrollTop = 0; });
  await popup.locator('#clipButton').scrollIntoViewIfNeeded();
  const saveButton = await popup.locator('#clipButton').boundingBox();
  assert.ok(saveButton.y + saveButton.height <= 600.5, JSON.stringify({ saveButton, metrics: await popup.locator('main').evaluate((main) => ({ scrollTop: main.scrollTop, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight })) }));
  await popup.locator('#logoutButton').scrollIntoViewIfNeeded();
  const logoutButton = await popup.locator('#logoutButton').boundingBox();
  assert.ok(logoutButton.y + logoutButton.height <= 600);
  console.log('PASS: six-digit typing, paste, navigation, invalid-code reset, logo and stable 340x600 sizing');
  const authState = await worker.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  assert.ok(!authState.local.auth); assert.equal(authState.session.auth.token, 'test-session-token');
  assert.ok(!JSON.stringify(authState).includes('123456'));
  assert.equal(await popup.locator('#topicSelect').inputValue(), 'learning');
  const sourceTab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url: url.split('?')[0] + '*' }))[0], fixtureUrl);
  const extract = async (clipType) => (await worker.evaluate(async ({ id, clipType }) => chrome.tabs.sendMessage(id, { type: 'yohoClipper:extract', clipType }), { id: sourceTab.id, clipType })).data.markdown;
  const markdown = await extract('article');
  assert.ok(markdown.includes('    const spaces')); assert.ok(markdown.includes("'a  b'"));
  assert.ok(markdown.includes(";\n\n\n    return"));
  assert.match(markdown, /3\. Read slowly\n\s+- Take a note/);
  assert.ok(markdown.includes('``a`b``')); assert.ok(markdown.includes('&lt;img'));
  assert.ok(markdown.includes('| Name | Idea |'));
  for (const secret of ['javascript:', 'SECRET HIDDEN', 'DO NOT SAVE FORM', 'REMOVE NAVIGATION', 'REMOVE FOOTER', 'window.fixtureLoaded']) assert.ok(!markdown.includes(secret), secret);
  console.log('PASS: extension loads, login gating, real worker authentication, topics and Markdown fidelity');

  const longTitle = '这是一个需要完整保存并在单行标题框中使用省略号展示的长文章标题'.repeat(3);
  await popup.locator('#pageTitle').fill(longTitle);
  await popup.locator('#topicTrigger').focus();
  assert.equal(await popup.locator('#pageTitle').inputValue(), longTitle);
  assert.equal(await popup.locator('#pageTitle').getAttribute('title'), longTitle);
  assert.equal(await popup.locator('#pageTitle').evaluate((input) => input.tagName), 'INPUT');
  assert.equal(await popup.locator('#pageTitle').evaluate((input) => getComputedStyle(input).textOverflow), 'ellipsis');
  assert.equal(await popup.locator('#pageTitle').evaluate((input) => input.getBoundingClientRect().height), 28);
  console.log('PASS: single-line title, ellipsis at rest and complete editable value');
  await popup.locator('#pageTitle').fill('My saved reading notes');
  // Searchable picker, keyboard choice, no-results recovery and Escape dismissal.
  await popup.locator('#topicTrigger').click();
  await popup.locator('#topicSearch').fill('不存在的分类');
  assert.equal(await popup.locator('#topicEmpty').isVisible(), true);
  await popup.locator('#topicSearch').fill('设计');
  await popup.keyboard.press('Enter');
  assert.equal(await popup.locator('#topicLabel').textContent(), '设计');
  await popup.locator('#topicTrigger').click(); await popup.keyboard.press('Escape');
  assert.equal(await popup.locator('#topicMenu').isVisible(), false);
  await popup.locator('#tagSuggestions button').filter({ hasText: '阅读' }).click();
  await popup.locator('#tagInput').fill('收藏'); await popup.keyboard.press('Enter');
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 2);
  await popup.locator('#tagInput').fill('阅读，');
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 2, 'duplicate tags are ignored');
  await popup.locator('#tagInput').fill('暂留'); await popup.keyboard.press('Enter');
  assert.equal(await popup.locator('#tagCount').textContent(), '3 / 3');
  assert.equal(await popup.locator('#tagSuggestions').isVisible(), false);
  await popup.locator('#tagInput').fill('第四'); await popup.keyboard.press('Enter');
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 3);
  assert.equal(await popup.locator('#tagInput').inputValue(), '第四');
  assert.equal(await popup.locator('#tagFeedback').isVisible(), true);
  await popup.locator('main').evaluate((main) => { main.scrollTop = main.scrollHeight; });
  assert.equal(await popup.evaluate(() => {
    const action = document.querySelector('#clipButton').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return action.top >= main.top && action.bottom <= main.bottom;
  }), true, 'the relocated action stays visible while editing tags');
  await popup.locator('#tagInput').fill('第四，第五');
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 3);
  const beforeTagLimit = requests.filter((request) => request.path === '/v1/articles').length;
  await popup.locator('#clipButton').click();
  await popup.locator('#errorMessage').filter({ hasText: '请调整标签' }).waitFor();
  assert.equal(requests.filter((request) => request.path === '/v1/articles').length, beforeTagLimit);
  await popup.locator('#tagInput').fill('');
  await popup.keyboard.press('Backspace');
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 2);
  await popup.locator('#tagInput').fill('x'.repeat(41)); await popup.keyboard.press('Enter');
  assert.equal(await popup.locator('#tagFeedback').isVisible(), true);
  await popup.locator('#tagInput').fill('待输入');
  await popup.reload(); await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#tagInput').inputValue(), '待输入');
  await popup.locator('#tagInput').fill('');
  console.log('PASS: custom picker search, keyboard, empty results; tag suggestions, chips, limits and draft restoration');
  await worker.evaluate(async (sourceUrl) => {
    const tab = (await chrome.tabs.query({ url: sourceUrl.split('?')[0] + '*' }))[0];
    const key = `draft:${tab.id}`;
    const saved = await chrome.storage.session.get(key);
    await chrome.storage.session.set({ [key]: { ...saved[key], tagNames: '阅读，收藏，旧标签甲，旧标签乙', tagDraft: '' } });
  }, fixtureUrl);
  await popup.reload(); await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#tagChips .tag-chip').count(), 4);
  assert.match(await popup.locator('#tagFeedback').textContent(), /移除多余/);
  await popup.locator('#clipButton').click();
  await popup.locator('#errorMessage').filter({ hasText: '请调整标签' }).waitFor();
  await popup.locator('button[aria-label="移除标签 旧标签甲"]').click();
  await popup.locator('button[aria-label="移除标签 旧标签乙"]').click();
  assert.equal(await popup.locator('#tagFeedback').isVisible(), false);
  const rejectedTags = await popup.evaluate(async (sourceUrl) => {
    const [tab] = await chrome.tabs.query({});
    return chrome.runtime.sendMessage({ type: 'yohoClipper:createArticle', tabId: tab.id,
      payload: { title: 'Tag limit', clipType: 'article', content: 'Text', sourceUrl, tagNames: ['一', '二', '三', '四'] } });
  }, fixtureUrl);
  assert.equal(rejectedTags.error, 'invalid_tags');
  console.log('PASS: three-tag limit, pending/bulk-input save guard, preserved legacy drafts and worker validation');

  failSave = true;
  await popup.locator('#clipButton').click();
  await popup.locator('#errorMessage').filter({ hasText: '暂时无法保存到页息，内容已保留' }).waitFor();
  assert.equal((await popup.locator('.app-header').boundingBox()).y, 0);
  assert.equal(await popup.evaluate(() => window.scrollY), 0);
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#pageTitle').inputValue(), 'My saved reading notes');
  assert.equal(await popup.locator('#tagNames').inputValue(), '阅读，收藏');
  await popup.reload();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#pageTitle').inputValue(), 'My saved reading notes');
  assert.equal(await popup.locator('#topicSelect').inputValue(), 'design');
  failSave = false;
  await popup.locator('#clipButton').click(); await visiblePanel(popup, 'successPanel');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'My saved reading notes');
  assert.equal(articles[0].status, 'draft'); assert.equal(articles[0].format, 'md');
  assert.equal(articles[0].topicId, 'design'); assert.ok(!('topicName' in articles[0]));
  assert.deepEqual(articles[0].tagNames, ['阅读', '收藏']);
  assert.match(articles[0].sourceChecksum, /^[0-9a-f]{64}$/);
  assert.equal(articles[0].sourceUrl, fixtureUrl);
  assert.equal(articles[0].coverAssetId, 'inline-asset-1');
  assert.equal(articles[0].cover, null);
  assert.ok(articles[0].content.includes(`![Reading \\[notes\\]](${base}/v1/assets/inline-asset-1/content)`));
  assert.ok(articles[0].content.includes(`![Inline notes](${base}/v1/assets/inline-asset-2/content)`));
  assert.ok(!articles[0].content.includes('/cover.png'));
  assert.ok(!articles[0].content.includes('/inline.png'));
  assert.deepEqual(remoteImageRequests.slice(-2).map((request) => ({ path: request.path, referer: request.referer })), [
    { path: '/cover.png', referer: null },
    { path: '/inline.png', referer: null },
  ]);
  console.log('PASS: inline article images upload without a cross-site referrer and replace remote Markdown links');
  await popup.reload(); await visiblePanel(popup, 'successPanel'); assert.equal(articles.length, 1);
  await assertPopupSize(popup);
  await popup.locator('#openArticleButton').click();
  await context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  assert.ok(context.pages().some((page) => page.url() === `${base}/a/5SkpM6nZl2Q8vR9bX1cY0d`));
  const savedState = await worker.evaluate(async () => chrome.storage.local.get('saveJob'));
  assert.equal(savedState.saveJob.article.shortId, articles[0].shortId);
  console.log('PASS: failure keeps inputs, reopening restores draft, successful save persists and opens correct URL');

  await popup.bringToFront(); await popup.locator('#clipAnotherButton').click();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  await popup.locator('#selectionMode').check();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  const selectedPreview = await extract('selection');
  assert.equal(await popup.locator('#clipModes').evaluate((modes) => modes.style.getPropertyValue('--mode-index')), '3');
  assert.ok(selectedPreview.includes('useful ideas')); assert.ok(!selectedPreview.includes('Reading list'));
  await popup.locator('#clipButton').click(); await visiblePanel(popup, 'successPanel');
  assert.equal(articles[1].clipType, 'selection'); assert.ok(!articles[1].content.includes('Reading list'));
  await popup.locator('#clipAnotherButton').click(); await wait(popup, () => !document.getElementById('clipButton').disabled);
  await popup.locator('input[name="clipType"][value="bookmark"]').check();
  await source.evaluate(() => document.querySelector('meta[name="description"]').content = '<script>unsafe()</script> Bookmark context');
  await popup.locator('input[name="clipType"][value="article"]').check();
  await popup.locator('input[name="clipType"][value="bookmark"]').check();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#clipModes').evaluate((modes) => modes.style.getPropertyValue('--mode-index')), '4');
  await popup.locator('#clipButton').click(); await visiblePanel(popup, 'successPanel');
  assert.equal(articles[2].clipType, 'bookmark'); assert.ok(!articles[2].content.includes('function example'));
  assert.ok(!articles[2].content.includes('<script>'));
  assert.ok(articles[2].content.includes('&lt;script&gt;'));
  console.log('PASS: selection and bookmark save their extracted content');

  await popup.locator('#clipAnotherButton').click(); await wait(popup, () => !document.getElementById('clipButton').disabled);
  failTopics = true;
  await popup.locator('#refreshTopics').click();
  await popup.locator('#errorMessage').filter({ hasText: '页息暂时不可用' }).waitFor();
  assert.equal(await popup.locator('#loginPanel').isVisible(), false);
  assert.equal(await popup.locator('#clipButton').isDisabled(), true);
  const stillAuth = await worker.evaluate(async () => chrome.storage.session.get('auth')); assert.ok(stillAuth.auth);
  failTopics = false; emptyTopics = true;
  await popup.locator('#retryButton').click();
  await wait(popup, () => !document.getElementById('clipButton').disabled);
  assert.equal(await popup.locator('#topicLabel').textContent(), '学习（保存时创建）');
  await popup.locator('#clipButton').click(); await visiblePanel(popup, 'successPanel'); assert.equal(articles[3].topicName, '学习');
  console.log('PASS: topics failure preserves login and retries; empty topics create a default category');

  emptyTopics = false;
  await popup.locator('#clipAnotherButton').click(); await wait(popup, () => !document.getElementById('clipButton').disabled);
  await popup.locator('#newTopicToggle').click(); await popup.locator('#newTopicName').fill('资料');
  saveDelay = 650;
  await popup.locator('#clipButton').click();
  await popup.waitForFunction(() => document.getElementById('clipButton').textContent.includes('正在剪藏'));
  await popup.close();
  const recovered = await context.newPage();
  await recovered.goto(popupUrl); await visiblePanel(recovered, 'successPanel');
  assert.equal(articles.at(-1).topicName, '资料');
  saveDelay = 0;
  await recovered.locator('#clipAnotherButton').click();
  await wait(recovered, () => !document.getElementById('clipButton').disabled);
  assert.equal(await recovered.locator('#tagNames').isDisabled(), false);
  assert.equal(await recovered.locator('#topicSelect').isDisabled(), false);
  console.log('PASS: closing popup while saving completes in worker and result restores on reopening');

  const duplicatePayload = { ...articles[0] };
  const concurrent = await recovered.evaluate(async (payload) => {
    const [tab] = await chrome.tabs.query({});
    const message = { type: 'yohoClipper:createArticle', tabId: tab.id, payload, topic: { id: 'design', name: '设计' } };
    return await Promise.all([chrome.runtime.sendMessage(message), chrome.runtime.sendMessage(message)]);
  }, duplicatePayload);
  assert.equal(concurrent.filter((result) => result.ok).length, 1);
  assert.ok(concurrent.some((result) => result.error === 'save_in_progress'));
  console.log('PASS: concurrent saves cannot create duplicate drafts');

  validSession = false;
  await recovered.locator('#clipAnotherButton').click();
  await visiblePanel(recovered, 'loginPanel');
  const revoked = await worker.evaluate(async () => ({ local: await chrome.storage.local.get('auth'), session: await chrome.storage.session.get('auth') }));
  assert.ok(!revoked.local.auth && !revoked.session.auth);
  await enterCode(recovered, '123456'); await recovered.locator('#loginButton').click();
  await wait(recovered, () => !document.getElementById('clipButton').disabled);
  assert.ok((await worker.evaluate(async () => chrome.storage.local.get('auth'))).auth);
  await assertPopupSize(recovered);
  assert.equal(await recovered.locator('#settingsToggle, #settingsPanel').count(), 0);
  const beforeInvalid = requests.length;
  const invalidSetting = await recovered.evaluate(async () => chrome.runtime.sendMessage({ type: 'yohoClipper:saveSettings', settings: { apiBaseUrl: 'https://name:password@example.com', webBaseUrl: 'https://example.com' } }));
  assert.equal(invalidSetting.ok, false);
  assert.equal(requests.length, beforeInvalid, 'invalid settings must not send credentials to another origin');
  await recovered.emulateMedia({ reducedMotion: 'reduce' });
  await recovered.locator('input[name="clipType"][value="bookmark"]').check();
  await wait(recovered, () => !document.getElementById('clipButton').disabled);
  assert.equal(await recovered.locator('.mode-indicator').evaluate((indicator) => parseFloat(getComputedStyle(indicator).transitionDuration)), 0.00001);
  await wait(recovered, () => !document.getAnimations().some((animation) => animation.playState === 'running'));
  await recovered.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('PASS: no connection settings, sliding clip selector, keyboard controls and reduced-motion fallback');
  await recovered.evaluate(async (address) => chrome.runtime.sendMessage({ type: 'yohoClipper:saveSettings', settings: { apiBaseUrl: address, webBaseUrl: `${address}/workspace` } }), base);
  await recovered.reload(); await visiblePanel(recovered, 'loginPanel');
  const cleared = await worker.evaluate(async () => ({ local: await chrome.storage.local.get('auth'), session: await chrome.storage.session.get('auth') }));
  assert.ok(!cleared.local.auth && !cleared.session.auth);
  assert.ok(requests.some((request) => request.path === '/v1/auth/logout' && request.token === 'test-session-token'));
  assert.deepEqual(consoleErrors, []);
  console.log('PASS: unauthorized session clears, remembered login persists, service switch revokes old session');
  await source.bringToFront();
  const togglePanel = () => worker.evaluate(async (sourceUrl) => {
    const tab = (await chrome.tabs.query({ url: sourceUrl.split('?')[0] + '*' }))[0];
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/panel.js'] });
  }, fixtureUrl);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(await worker.evaluate(() => chrome.action.onClicked.hasListeners()), true);
  await togglePanel();
  const panelFrame = async () => {
    await source.locator('#shiye-clipper-panel iframe').waitFor();
    return (await source.locator('#shiye-clipper-panel iframe').elementHandle()).contentFrame();
  };
  let panel = await panelFrame();
  await visiblePanel(panel, 'loginPanel');
  await source.waitForFunction(() => !document.querySelector('#shiye-clipper-panel').getAnimations().some((animation) => animation.playState === 'running'));
  assert.equal(await panel.locator('#closePanelButton').isVisible(), true);
  for (const viewport of [{ width: 1280, height: 900 }, { width: 900, height: 640 }, { width: 360, height: 740 }, { width: 1280, height: 1100 }]) {
    await source.setViewportSize(viewport);
    const box = await source.locator('#shiye-clipper-panel').boundingBox();
    assert.equal(box.width, Math.min(340, viewport.width - 24));
    assert.equal(box.height, viewport.height - 24);
    assert.equal(box.y, 12);
    assert.equal(box.x + box.width, viewport.width - 12);
    const dimensions = await panel.evaluate(() => ({ width: document.body.clientWidth, height: document.body.clientHeight, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(dimensions.width, dimensions.viewportWidth);
    assert.equal(dimensions.height, dimensions.viewportHeight);
    assert.equal(dimensions.overflow, false);
  }
  await enterCode(panel, '123456');
  await panel.locator('#loginButton').click();
  await visiblePanel(panel, 'clipPanel');
  await wait(panel, () => !document.getElementById('clipButton').disabled);
  assert.equal(await panel.locator('#pageUrl').count(), 0);
  assert.ok((await panel.locator('#copyLinkButton').getAttribute('title')).includes(fixtureUrl));
  assert.equal(await source.locator('#shiye-clipper-panel iframe').getAttribute('allow'), 'clipboard-write');
  assert.ok((await extract('article')).includes('function example'));
  assert.equal(await panel.locator('#contentPreview').count(), 0);
  assert.ok((await panel.locator('#clipButton').boundingBox()).y + 36 < 1100 - 24);
  await panel.locator('#tagInput').fill('侧边剪藏'); await panel.locator('#tagInput').press('Enter');
  await worker.evaluate(async (tabUrl) => {
    const tab = (await chrome.tabs.query({ url: tabUrl.split('?')[0] + '*' }))[0];
    for (let tries = 0; tries < 60; tries++) {
      const result = await chrome.storage.session.get(`draft:${tab.id}`);
      if (result[`draft:${tab.id}`]?.tagNames === '侧边剪藏') return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('panel draft was not persisted');
  }, fixtureUrl);
  failSave = true;
  await panel.locator('#clipButton').click();
  await panel.locator('#errorMessage').filter({ hasText: '内容已保留' }).waitFor();
  assert.equal(await panel.locator('.app-header').evaluate((header) => header.getBoundingClientRect().y), 0);
  assert.equal(await panel.evaluate(() => window.scrollY), 0);
  assert.equal((await source.locator('#shiye-clipper-panel').boundingBox()).y, 12);
  assert.equal(await panel.locator('#closePanelButton').isVisible(), true);
  failSave = false;
  await panel.locator('#closePanelButton').click();
  await source.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  await togglePanel();
  panel = await panelFrame();
  await wait(panel, () => !document.getElementById('clipButton').disabled);
  assert.equal(await panel.locator('#tagNames').inputValue(), '侧边剪藏');
  assert.equal(await source.locator('#shiye-clipper-panel').count(), 1);
  // Six modes use real extraction and the real HTTP/save pipeline in the isolated profile.
  await panel.locator('#topicTrigger').click(); await panel.locator('#topicSearch').press('Escape');
  assert.equal(await source.locator('#shiye-clipper-panel').count(), 1, 'Escape closes picker before panel');
  for (const type of ['full_page', 'simplified']) {
    await panel.locator(`input[name="clipType"][value="${type}"]`).check();
    await wait(panel, () => !document.getElementById('clipButton').disabled);
    await panel.locator('#clipButton').click(); await visiblePanel(panel, 'successPanel');
    const article = articles.at(-1);
    assert.equal(article.clipType, type);
    if (type === 'full_page') {
      assert.ok(article.content.includes('REMOVE NAVIGATION') && article.content.includes('REMOVE FOOTER'));
      assert.ok(article.content.includes('Reading list'));
      assert.ok(article.content.includes('![Reading \\[notes\\]]('));
      assert.ok(article.content.includes(`/v1/assets/inline-asset-2/content`));
    } else {
      assert.ok(article.content.includes('Reading list') && article.content.includes('function example'));
      assert.ok(!article.content.includes('![Reading') && !article.cover);
    }
    for (const secret of ['SECRET HIDDEN', 'DO NOT SAVE FORM', 'javascript:', 'window.fixtureLoaded', 'shiye-clipper-panel']) assert.ok(!article.content.includes(secret));
    // Storage can show success before the original save response finishes unlocking the form.
    await wait(panel, () => !document.getElementById('clipButton').disabled);
    await panel.locator('#clipAnotherButton').click();
    await visiblePanel(panel, 'clipPanel');
    await wait(panel, () => !document.getElementById('clipButton').disabled);
  }
  await panel.locator('input[name="clipType"][value="screenshot"]').check();
  await wait(panel, () => !document.getElementById('clipButton').disabled);
  const screenshotUploads = () => requests.filter((request) => request.path === '/v1/assets').length;
  const beforeCapture = articles.length;
  const beforeUploads = screenshotUploads();
  // The capture API requires a user toolbar gesture. Stub only that platform boundary;
  // panel hide/restore, Blob, multipart upload, authentication and article save stay real.
  await worker.evaluate(() => {
    globalThis.captureCount = 0;
    chrome.tabs.captureVisibleTab = async (windowId) => {
      globalThis.captureCount++;
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => getComputedStyle(document.querySelector('#shiye-clipper-panel')).visibility });
      if (result.result !== 'hidden') throw new Error('clipper must be hidden during capture');
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
    };
  });
  failAsset = true;
  await panel.locator('#clipButton').click();
  await panel.locator('#errorMessage').filter({ hasText: '暂时无法保存图片' }).waitFor();
  assert.equal(articles.length, beforeCapture);
  assert.equal(screenshotUploads(), beforeUploads + 1);
  assert.equal(await source.locator('#shiye-clipper-panel').evaluate((host) => getComputedStyle(host).visibility), 'visible');
  assert.equal(await panel.locator('#tagNames').inputValue(), '侧边剪藏');
  failAsset = false;
  await panel.locator('#clipButton').click(); await visiblePanel(panel, 'successPanel');
  const shot = articles.at(-1);
  assert.equal(shot.clipType, 'screenshot'); assert.equal(shot.coverAssetId, 'capture-asset');
  assert.ok(shot.content.includes(`![网页截图](${base}/v1/assets/capture-asset/content)`));
  assert.ok(!shot.content.includes('function example'));
  assert.equal(shot.wordCount, 0); assert.equal(shot.readingTimeMinutes, 0);
  assert.equal(await source.locator('#shiye-clipper-panel').evaluate((host) => getComputedStyle(host).visibility), 'visible');
  assert.equal(await worker.evaluate(() => globalThis.captureCount), 2);
  await panel.locator('#clipAnotherButton').click(); await wait(panel, () => !document.getElementById('clipButton').disabled);
  const beforeChanged = screenshotUploads();
  const changedResult = await panel.evaluate(async ({ id, sourceUrl }) => chrome.runtime.sendMessage({
    type: 'yohoClipper:createArticle', tabId: id, captureUrl: `${sourceUrl}?changed`,
    payload: { title: 'Changed page', clipType: 'screenshot', content: '', sourceUrl },
  }), { id: sourceTab.id, sourceUrl: fixtureUrl });
  assert.equal(changedResult.error, 'capture_tab_changed');
  assert.equal(screenshotUploads(), beforeChanged);
  assert.equal(await worker.evaluate(() => globalThis.captureCount), 2);
  console.log('PASS: whole page and text extraction, panel-free screenshot, multipart asset upload, failure recovery and source-tab checks');
  await panel.locator('#pageTitle').focus();
  await source.keyboard.press('Escape');
  await source.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  await togglePanel();
  await togglePanel();
  assert.equal(await source.locator('#shiye-clipper-panel').count(), 0);
  console.log('PASS: toolbar panel, 12px margins, full-height resize, narrow viewport, source-tab binding, close/Escape/toggle and draft recovery');
  // Preserve compatibility with preferences saved by 0.5.0; the about page never edits them.
  const setPreference = async (name, value) => worker.evaluate(async ({ name, value }) => {
    const { preferences = {} } = await chrome.storage.local.get('preferences');
    await chrome.storage.local.set({ preferences: { ...preferences, [name]: value } });
  }, { name, value });
  await setPreference('defaultClipType', 'bookmark'); await setPreference('topicStrategy', 'learning');
  await setPreference('reduceMotion', true);
  const freshSource = await context.newPage();
  const freshUrl = `${base}/fixture?fresh=settings`;
  await freshSource.goto(freshUrl); await freshSource.bringToFront();
  const freshTab = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url), freshUrl);
  const openFresh = () => worker.evaluate(async (id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ['src/panel.js'] }), freshTab.id);
  const getFreshFrame = async () => {
    await freshSource.locator('#shiye-clipper-panel iframe').waitFor();
    return (await freshSource.locator('#shiye-clipper-panel iframe').elementHandle()).contentFrame();
  };
  await openFresh(); let freshFrame = await getFreshFrame();
  await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  assert.equal(await freshFrame.locator('input[value="bookmark"]').isChecked(), true);
  assert.equal(await freshFrame.locator('#topicSelect').inputValue(), 'learning');
  assert.equal(await freshFrame.evaluate(() => document.documentElement.classList.contains('reduce-motion')), true);
  assert.equal(await freshSource.locator('#shiye-clipper-panel').evaluate((host) => host.getAnimations().length), 0);
  // Existing drafts take precedence over the default mode/category.
  await freshFrame.locator('input[value="simplified"]').check();
  await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  await freshFrame.locator('#topicTrigger').click(); await freshFrame.locator('#topicSearch').fill('设计'); await freshFrame.locator('#topicSearch').press('Enter');
  await worker.evaluate(async (id) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const key = `draft:${id}`; const saved = await chrome.storage.session.get(key);
      if (saved[key]?.clipType === 'simplified' && saved[key]?.topicId === 'design') return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('fresh draft was not stored');
  }, freshTab.id);
  await freshFrame.locator('#closePanelButton').click(); await freshSource.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  await openFresh(); freshFrame = await getFreshFrame(); await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  assert.equal(await freshFrame.locator('input[value="simplified"]').isChecked(), true);
  assert.equal(await freshFrame.locator('#topicSelect').inputValue(), 'design');
  await setPreference('defaultClipType', 'recent');
  await freshFrame.locator('#closePanelButton').click(); await freshSource.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  await worker.evaluate(async (id) => chrome.storage.session.remove(`draft:${id}`), freshTab.id);
  await openFresh(); freshFrame = await getFreshFrame(); await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  assert.equal(await freshFrame.locator('input[value="simplified"]').isChecked(), true);
  await setPreference('defaultClipType', 'selection');
  await freshFrame.locator('#closePanelButton').click(); await freshSource.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  await openFresh(); freshFrame = await getFreshFrame(); await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  assert.equal(await freshFrame.locator('input[value="article"]').isChecked(), true, 'selection default falls back when no selection exists');
  // A newly completed save opens its article once; restored success never repeats it.
  await setPreference('afterClip', 'open');
  const openedArticlePromise = context.waitForEvent('page');
  await freshFrame.locator('#clipButton').click();
  const openedArticle = await openedArticlePromise;
  await openedArticle.waitForURL(`${base}/workspace/articles/*`);
  const countAfterOpen = context.pages().length;
  await freshFrame.goto(freshFrame.url()); await visiblePanel(freshFrame, 'successPanel');
  assert.equal(context.pages().length, countAfterOpen);
  await setPreference('afterClip', 'close');
  await freshFrame.locator('#clipAnotherButton').click(); await wait(freshFrame, () => !document.getElementById('clipButton').disabled);
  await freshSource.bringToFront(); await freshFrame.locator('#clipButton').click();
  await freshSource.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  assert.equal(articles.length, 11);
  console.log('PASS: defaults on new pages, existing-draft precedence, recent mode, selection fallback, reduced motion and one-shot open/auto-close after save');

  // Keep the about-opening regression on its own source tab, separate from save scenarios.
  const aboutSource = await context.newPage();
  const aboutSourceUrl = `${base}/fixture?about-only=1`;
  await aboutSource.goto(aboutSourceUrl);
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/panel.js'] });
  }, aboutSourceUrl);
  await aboutSource.locator('#shiye-clipper-panel iframe').waitFor();
  const aboutFrame = await (await aboutSource.locator('#shiye-clipper-panel iframe').elementHandle()).contentFrame();
  await visiblePanel(aboutFrame, 'clipPanel');
  await wait(aboutFrame, () => !document.getElementById('clipButton').disabled);
  await aboutFrame.locator('#tagInput').fill('侧边剪藏');
  await aboutFrame.locator('#tagInput').press('Enter');
  await aboutFrame.locator('#pageTitle').fill('保留标题');
  await aboutFrame.locator('#tagInput').fill('未成签');
  await aboutFrame.locator('input[value="bookmark"]').check();
  await wait(aboutFrame, () => !document.getElementById('clipButton').disabled);
  await aboutFrame.evaluate(() => { document.querySelector('main').scrollTop = 120; });
  const readClip = () => aboutFrame.evaluate(() => ({
    title: document.getElementById('pageTitle').value,
    tags: document.getElementById('tagNames').value,
    pendingTag: document.getElementById('tagInput').value,
    topic: document.getElementById('topicSelect').value,
    mode: document.querySelector('input[name="clipType"]:checked').value,
    scroll: document.querySelector('main').scrollTop,
  }));
  const clipBeforeAbout = await readClip();
  const outerBeforeAbout = await aboutSource.locator('#shiye-clipper-panel').boundingBox();
  const frameAddress = aboutFrame.url();
  const sourceAddress = aboutSource.url();
  const pageCountBeforeInlineAbout = context.pages().length;
  await aboutFrame.locator('#aboutButton').click();
  await visiblePanel(aboutFrame, 'aboutPanel');
  assert.equal(context.pages().length, pageCountBeforeInlineAbout);
  assert.equal(aboutFrame.url(), frameAddress);
  assert.equal(aboutSource.url(), sourceAddress);
  assert.deepEqual(await aboutSource.locator('#shiye-clipper-panel').boundingBox(), outerBeforeAbout);
  assert.equal(await aboutFrame.locator('#aboutPanel #version').textContent(), manifest.version);
  assert.equal(await aboutFrame.evaluate(() => document.activeElement.id), 'backToClipButton');
  assert.equal(await aboutFrame.locator('#copyLinkButton').isVisible(), false);
  assert.equal(await aboutFrame.locator('#aboutPanel .clip-kind').count(), 6);
  const articlesBeforeAboutShortcut = articles.length;
  await aboutSource.keyboard.press('Control+Enter');
  assert.equal(articles.length, articlesBeforeAboutShortcut);
  await visiblePanel(aboutFrame, 'aboutPanel');
  // Scrolling the about content leaves its header and outer panel stationary.
  await aboutFrame.evaluate(() => { document.querySelector('main').scrollTop = 1000; });
  assert.equal(await aboutFrame.locator('.app-header').evaluate((header) => header.getBoundingClientRect().y), 0);
  assert.equal(await aboutFrame.evaluate(() => window.scrollY), 0);
  await aboutFrame.locator('#backToClipButton').click();
  await visiblePanel(aboutFrame, 'clipPanel');
  assert.deepEqual(await readClip(), clipBeforeAbout);
  assert.equal(await aboutFrame.evaluate(() => document.activeElement.id), 'aboutButton');
  assert.equal(await aboutFrame.locator('#copyLinkButton').isVisible(), true);
  await aboutFrame.locator('#aboutButton').click();
  await visiblePanel(aboutFrame, 'aboutPanel');
  await aboutSource.keyboard.press('Escape');
  await visiblePanel(aboutFrame, 'clipPanel');
  assert.deepEqual(await readClip(), clipBeforeAbout);
  assert.equal(await aboutSource.locator('#shiye-clipper-panel').count(), 1);
  await aboutFrame.locator('#aboutButton').click();
  await aboutFrame.locator('#closePanelButton').click();
  await aboutSource.locator('#shiye-clipper-panel').waitFor({ state: 'detached' });
  console.log('PASS: real iframe about opens inline without new tabs or resize; return/Escape preserve fields, scroll and focus; close works');

  console.log(`ALL CHECKS PASSED (${articles.length} isolated mock drafts; no production writes)`);
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
