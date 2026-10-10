import { DEFAULT_PREFERENCES, resolvePreferences } from '../src/preferences.js';
import { mountAbout } from '../src/about.js';
import { exportMarkdownFile, exportZipFile } from '../src/export.js';

const ids = [
  'closePanelButton', 'backToClipButton', 'panelTitle', 'aboutContent', 'copyLinkButton', 'copyLinkIcon', 'copyLinkText', 'copyFeedback',
  'connectionStatus', 'loadingPanel', 'connectionPanel',
  'loginPanel', 'loginForm', 'accessCode', 'showCode', 'remember', 'loginButton',
  'clipPanel', 'aboutPanel', 'aboutButton', 'clipFooter', 'clipForm', 'topicSelect', 'refreshTopics', 'newTopicToggle', 'newTopicField',
  'newTopicName', 'selectionMode', 'modeHint', 'pageTitle', 'pageSource',
  'pageStats', 'siteInitial', 'tagNames', 'tagInput', 'tagChips', 'tagCount', 'tagFeedback', 'tagSuggestions',
  'topicTrigger', 'topicLabel', 'topicMenu', 'topicSearch', 'topicOptions', 'topicEmpty',
  'pagePreview', 'clipModes', 'clipButton', 'exportMarkdownButton', 'exportZipButton', 'logoutButton', 'successPanel', 'successMessage', 'successTopic',
  'openArticleButton', 'clipAnotherButton', 'errorPanel', 'errorMessage', 'retryButton',
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
mountAbout(elements.aboutContent, { embedded: true });
const codeInputs = Array.from(document.querySelectorAll('.code-digit'));
const panels = ['loadingPanel', 'connectionPanel', 'loginPanel', 'clipPanel', 'successPanel', 'aboutPanel'];
const enteredPanels = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const inSidePanel = new URLSearchParams(location.search).get('surface') === 'panel';
if (inSidePanel) {
  document.documentElement.classList.add('side-panel');
  elements.closePanelButton.hidden = false;
}
const errors = {
  invalid_access_code: '访问码不正确，请重新输入。',
  invalid_code_format: '请输入 6 位数字访问码。',
  unauthorized: '登录已过期，请重新输入访问码。',
  network_error: '暂时无法连接页息，请检查网络后重试。',
  request_timeout: '连接超时。若正在保存，请先到页息确认草稿，再决定是否重试。',
  invalid_response: '页息返回了无法识别的内容，请稍后重试。',
  invalid_save_response: '服务返回的保存结果不完整，请到页息确认草稿。',
  database_not_configured: '页息暂时不可用，请稍后重试。',
  access_code_not_configured: '页息尚未配置访问码，请先完成服务设置。',
  topic_not_found: '所选分类已被删除，请刷新分类后重新选择。',
  save_in_progress: '上一次剪藏还在保存，请稍候。',
  save_interrupted: '上一次保存未收到确认，请先到页息查看是否已生成草稿。',
  capture_tab_changed: '请回到要剪藏的网页，再点击剪藏。',
  capture_failed: '无法截取当前网页，请关闭并重新打开拾页后重试。',
  capture_too_large: '截图超过 5MB，请缩小浏览器窗口后重试。',
  storage_not_configured: '页息暂时无法保存图片，请稍后重试或选择其他剪藏方式。',
  invalid_tags: '最多 3 个标签，每个最多 40 个字。',
  invalid_clip: '剪藏内容不完整或过长，请改用选中内容。',
};
let preferences = { ...DEFAULT_PREFERENCES };
let contentLoading = false;
let handledSaveId = null;
let authenticated = false;
let sessionChecked = false;
let topics = [];
let topicsReady = false;
let activeTab = null;
let pageData = null;
let savedArticleUrl = null;
let screen = 'loadingPanel';
let busy = false;
let pendingSave = false;
let exporting = false;
let previewVersion = 0;
let lastTopic = null;
let retryAction = null;
let draftTitle = null;
let draftTopic = null;
let tags = [];
let chosenTags = [];
let topicIndex = 0;
const MAX_TAGS = 3;
let copying = false;
let copyTimer;
let clipScrollPosition = 0;
const clipTypes = ['article', 'full_page', 'simplified', 'selection', 'bookmark', 'screenshot'];

async function worker(type, values = {}) {
  const result = await chrome.runtime.sendMessage({ type: `yohoClipper:${type}`, ...values });
  if (!result?.ok) throw Object.assign(new Error(result?.error || 'network_error'), { status: result?.status || 0 });
  return result;
}

function showPanel(panel) {
  screen = panel;
  updateCopyButton();
  elements.clipFooter.hidden = panel !== 'clipPanel';
  elements.backToClipButton.hidden = panel !== 'aboutPanel';
  elements.panelTitle.textContent = panel === 'aboutPanel' ? '关于拾页' : '拾页';
  panels.forEach((key) => { elements[key].hidden = key !== panel; });
  document.body.dataset.screen = panel;
  if (!enteredPanels.has(panel)) {
    enteredPanels.add(panel);
    if (panel === 'aboutPanel') {
      motion(elements.aboutContent.querySelector('.seal'), [{ opacity: 0, transform: 'translateY(-12px) rotate(-9deg)' }, { opacity: 1, transform: 'translateY(0) rotate(-5deg)' }], 360);
    } else {
      motion(elements[panel], [{ opacity: panel === 'successPanel' ? .45 : 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], panel === 'successPanel' ? 220 : 300);
    }
    if (panel === 'loginPanel') {
      motion(document.querySelector('.login-art'), [{ opacity: 0, transform: 'translateY(10px) rotate(-7deg)' }, { opacity: 1, transform: 'translateY(0) rotate(0)' }], 420);
    }
  }
}

function motion(element, keyframes, duration = 240) {
  if (reducedMotion.matches || preferences.reduceMotion) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate(keyframes, { duration, easing: 'cubic-bezier(.22,1,.36,1)' });
}

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) document.getAnimations().forEach((animation) => animation.cancel());
});

function setConnection(text, state = '') {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.classList.toggle('error', state === 'error');
}

function updateCopyButton() {
  elements.copyLinkButton.hidden = screen !== 'clipPanel';
  elements.copyLinkButton.disabled = copying || !pageData?.url;
  if (screen !== 'clipPanel' || !pageData?.url) {
    clearTimeout(copyTimer);
    setCopyFeedback('');
  }
  const label = elements.copyFeedback.textContent || '复制原文链接';
  elements.copyLinkButton.title = pageData?.url ? `${label}\n${pageData.url}` : '正在读取原文链接';
}

function setCopyFeedback(state) {
  elements.copyLinkButton.dataset.state = state;
  elements.copyLinkText.textContent = copying ? '复制中…' : state === 'copied' ? '已复制' : state === 'error' ? '重试复制' : '复制链接';
  elements.copyLinkIcon.setAttribute('href', state === 'copied' ? '#i-check' : '#i-copy');
  const message = state === 'copied' ? '已复制原文链接' : state === 'error' ? '链接未能复制，请点击重试。' : '';
  elements.copyFeedback.textContent = message;
  elements.copyLinkButton.setAttribute('aria-label', message || '复制原文链接');
}

function copyWithSelection(url) {
  const previous = document.activeElement;
  const selection = typeof previous?.selectionStart === 'number'
    ? [previous.selectionStart, previous.selectionEnd] : null;
  const input = document.createElement('textarea');
  input.value = url; input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(input);
  try {
    input.select();
    return document.execCommand('copy');
  } finally {
    input.remove(); previous?.focus({ preventScroll: true });
    if (selection) previous.setSelectionRange(...selection);
  }
}

elements.copyLinkButton.addEventListener('click', async () => {
  const url = pageData?.url;
  if (!url || copying) return;
  const previousFocus = document.activeElement;
  clearTimeout(copyTimer);
  copying = true; setCopyFeedback(''); updateCopyButton();
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); copied = true; }
      catch { copied = copyWithSelection(url); }
    } else copied = copyWithSelection(url);
  } catch { copied = false; }
  finally { copying = false; }
  if (screen === 'clipPanel' && pageData?.url === url) {
    setCopyFeedback(copied ? 'copied' : 'error');
    if (copied) {
      motion(elements.copyLinkButton.querySelector('svg'), [{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], 180);
      copyTimer = setTimeout(() => { setCopyFeedback(''); updateCopyButton(); }, 1800);
    }
  }
  updateCopyButton();
  if (previousFocus === elements.copyLinkButton && screen === 'clipPanel' && document.activeElement === document.body) {
    elements.copyLinkButton.focus({ preventScroll: true });
  }
});

function readableError(error) {
  if (error.status === 429 || /http_429|too many requests/i.test(error.message)) return '尝试次数过多，请稍等一分钟再试。';
  if (error.status === 401 && error.message !== 'invalid_access_code') return errors.unauthorized;
  if (error.status >= 500) return errors[error.message] || '页息服务暂时不可用，请稍后重试。';
  if (error.status === 404) return '页息接口暂时不可用，请更新扩展或稍后重试。';
  if (error.status === 400 && !errors[error.message]) return '页息未接受这份剪藏，请检查标题、分类和标签。';
  return errors[error.message] || error.message;
}

function showError(error, retry = null) {
  elements.errorMessage.textContent = typeof error === 'string' ? error : readableError(error);
  elements.errorPanel.hidden = false;
  retryAction = retry;
  elements.retryButton.hidden = !retry;
  const main = document.querySelector('main');
  const bounds = main.getBoundingClientRect();
  const errorBounds = elements.errorPanel.getBoundingClientRect();
  const visibleBottom = bounds.bottom - parseFloat(getComputedStyle(main).paddingBottom);
  // Scroll only the content pane; scrollIntoView can also move the popup root.
  if (errorBounds.bottom > visibleBottom) main.scrollTop += errorBounds.bottom - visibleBottom;
  else if (errorBounds.top < bounds.top) main.scrollTop -= bounds.top - errorBounds.top;
}

function clearError() {
  elements.errorPanel.hidden = true;
  elements.errorMessage.textContent = '';
  elements.retryButton.hidden = true;
  retryAction = null;
}

function updateSaveButton() {
  const contentReady = !contentLoading && Boolean(pageData);
  const operationBusy = busy || pendingSave || exporting;
  elements.clipButton.disabled = operationBusy || !contentReady || !sessionChecked || !topicsReady;
  elements.exportMarkdownButton.disabled = operationBusy || !contentReady;
  elements.exportZipButton.disabled = operationBusy || !contentReady;
  elements.logoutButton.disabled = busy || pendingSave;
  elements.aboutButton.disabled = busy || pendingSave;
  elements.refreshTopics.disabled = busy || pendingSave;
  elements.topicTrigger.disabled = busy || pendingSave || !topicsReady;
  updateLoginButton();
  updateCopyButton();
  elements.pagePreview.classList.toggle('is-saving', pendingSave);
}

function accessCode() {
  return codeInputs.map((input) => input.value).join('');
}

function updateLoginButton() {
  const complete = codeInputs.every((input) => /^\d$/.test(input.value));
  elements.loginButton.disabled = busy || !complete;
  elements.accessCode.classList.toggle('complete', complete);
  codeInputs.forEach((input) => input.classList.toggle('filled', Boolean(input.value)));
}

function focusDigit(index) {
  const input = codeInputs[Math.max(0, Math.min(codeInputs.length - 1, index))];
  input.focus();
  input.select();
}

function clearCode() {
  codeInputs.forEach((input) => { input.value = ''; });
  updateLoginButton();
}

function pasteCode(value) {
  const digits = value.replace(/\D/g, '').slice(0, codeInputs.length);
  codeInputs.forEach((input, index) => {
    input.value = digits[index] || '';
    input.removeAttribute('aria-invalid');
  });
  updateLoginButton();
  focusDigit(digits.length);
}

function buttonBusy(button, loading, text) {
  button.disabled = loading;
  button.dataset.loading = String(loading);
  button.replaceChildren();
  if (loading) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner);
  }
  const label = document.createElement('span');
  label.textContent = text;
  button.append(label);
  if (!loading) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', button === elements.clipButton ? '#i-mark' : '#i-arrow');
    icon.append(use);
    if (button === elements.clipButton) button.prepend(icon);
    else button.append(icon);
    if (button === elements.clipButton) {
      const shortcut = document.createElement('kbd');
      shortcut.setAttribute('aria-hidden', 'true');
      shortcut.textContent = /Mac/i.test(navigator.platform) ? '⌘↵' : 'Ctrl ↵';
      shortcut.hidden = !preferences.saveShortcutEnabled;
      button.append(shortcut);
    }
  }
}
function loginScreen(message = '') {
  authenticated = false;
  sessionChecked = false;
  topicsReady = false;
  previewVersion += 1;
  showPanel('loginPanel');
  setConnection(message);
  updateSaveButton();
  focusDigit(0);
}

async function handleError(error, retry) {
  if (error.status === 401 && error.message !== 'invalid_access_code') {
    loginScreen('登录已过期');
    showError(error);
  } else {
    showError(error, retry);
  }
}

function selectedMode() {
  return document.querySelector('input[name="clipType"]:checked').value;
}

function setMode(value) {
  const input = document.querySelector(`input[name="clipType"][value="${value}"]`);
  if (input) input.checked = true;
  updateModeIndicator();
}

function updateModeIndicator() {
  const index = clipTypes.indexOf(selectedMode());
  elements.clipModes.style.setProperty('--mode-index', index);
}

async function storeDraft() {
  if (!activeTab?.id || !authenticated || pendingSave) return;
  await chrome.storage.session.set({
    [`draft:${activeTab.id}`]: {
      tabUrl: activeTab.url, title: elements.pageTitle.value,
      tagNames: elements.tagNames.value, tagDraft: elements.tagInput.value, topicId: elements.topicSelect.value,
      newTopicName: elements.newTopicName.value,
      newTopic: !elements.newTopicField.hidden, clipType: selectedMode(),
    },
  });
}

async function readDraft() {
  draftTitle = null;
  draftTopic = null;
  if (!activeTab?.id) return;
  const key = `draft:${activeTab.id}`;
  const stored = await chrome.storage.session.get(key);
  const draft = stored[key];
  if (!draft || draft.tabUrl !== activeTab.url) return;
  draftTitle = draft.title || null;
  chosenTags = parseTags(draft.tagNames || '');
  elements.tagInput.value = draft.tagDraft || '';
  renderTags();
  elements.newTopicName.value = draft.newTopicName || '';
  toggleNewTopic(Boolean(draft.newTopic), false);
  if (clipTypes.includes(draft.clipType)) setMode(draft.clipType);
  if (draft.topicId) { draftTopic = { id: draft.topicId }; lastTopic = draftTopic; }
}

async function sendToPage(clipType) {
  if (!activeTab?.id || !/^https?:/.test(activeTab.url || '') || /^https?:\/\/chrome(webstore\.google\.com|\.google\.com\/webstore)/.test(activeTab.url)) {
    throw new Error('这个页面无法剪藏，请打开普通网页后再点击扩展。');
  }
  const message = { type: 'yohoClipper:extract', clipType };
  const send = () => chrome.tabs.sendMessage(activeTab.id, message);
  let response;
  try { response = await send(); }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['src/content.js'] });
      response = await send();
    } catch { throw new Error('无法读取这个网页，请刷新网页后重试。'); }
  }
  if (!response?.ok) throw new Error(response?.error || '无法解析当前网页。');
  return response.data;
}

async function refreshContent() {
  const version = ++previewVersion;
  const clipType = selectedMode();
  updateModeIndicator();
  elements.pagePreview.setAttribute('aria-busy', 'true');
  contentLoading = true;
  if (!pageData) elements.pageStats.textContent = '正在读取…';
  updateSaveButton();
  elements.modeHint.textContent = {
    article: '保留正文、图片和原文链接',
    full_page: '保留网页文字、图片、导航与页脚，存为可编辑文章',
    simplified: '只保留正文文字、链接与排版，省去图片',
    screenshot: '点击剪藏时截取网页可见区域，不包含拾页面板',
    selection: '只保留在网页中选中的内容',
    bookmark: '保留标题、摘要和原文链接',
  }[clipType];
  try {
    const data = await sendToPage(clipType);
    if (version !== previewVersion || !authenticated) return;
    if (clipType === 'selection' && !data.hasSelection) {
      setMode('article');
      return refreshContent();
    }
    pageData = data;
    chrome.storage.local.set({ lastClipType: clipType }).catch(() => {});
    if (!elements.pageTitle.value) elements.pageTitle.value = draftTitle || data.title;
    elements.pageTitle.title = elements.pageTitle.value;
    elements.pageSource.textContent = data.siteName || new URL(data.url).hostname;
    elements.siteInitial.textContent = (data.siteName || 'P').slice(0, 1).toUpperCase();
    elements.pageStats.textContent = clipType === 'screenshot' ? '当前可见区域' : clipType === 'bookmark' ? '原文链接' : `${data.wordCount.toLocaleString()} 字 · ${data.readingTimeMinutes} 分钟`;
    elements.selectionMode.disabled = !data.hasSelection;
    elements.selectionMode.closest('label').title = data.hasSelection ? '剪藏已选中的文字' : '请先在网页中选中文字';
  } catch (error) {
    if (version !== previewVersion) return;
    if (clipType === 'selection' && error.message === '请先选中要剪藏的内容') {
      setMode('article');
      return refreshContent();
    }
    pageData = null;
    elements.pageSource.textContent = '当前网页';
    showError(error, refreshContent);
  }
  if (version === previewVersion) {
    contentLoading = false;
    elements.pagePreview.setAttribute('aria-busy', 'false');
  }
  updateSaveButton();
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function topicChoices() {
  const query = elements.topicSearch.value.trim().toLocaleLowerCase();
  return (topics.length ? topics : [{ id: '', name: '学习（保存时创建）' }]).filter((topic) => topic.name.toLocaleLowerCase().includes(query));
}

function renderTopicOptions() {
  const choices = topicChoices();
  topicIndex = Math.max(0, Math.min(topicIndex, choices.length - 1));
  elements.topicOptions.replaceChildren();
  choices.forEach((topic, index) => {
    const option = document.createElement('button');
    option.type = 'button'; option.tabIndex = -1;
    option.className = 'topic-option'; option.id = `topic-option-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(topic.id === elements.topicSelect.value));
    option.classList.toggle('highlighted', index === topicIndex);
    const label = document.createElement('span'); label.textContent = topic.name;
    option.append(icon('folder'), label);
    if (topic.id === elements.topicSelect.value) option.append(icon('check'));
    option.addEventListener('click', () => {
      elements.topicSelect.value = topic.id; elements.topicLabel.textContent = topic.name;
      closeTopicMenu(); persistInputs();
      motion(elements.topicTrigger, [{ backgroundColor: '#eaf0e5' }, { backgroundColor: '#fffefb' }], 280);
    });
    elements.topicOptions.append(option);
  });
  elements.topicEmpty.hidden = choices.length > 0;
  if (choices.length) elements.topicSearch.setAttribute('aria-activedescendant', `topic-option-${topicIndex}`);
  else elements.topicSearch.removeAttribute('aria-activedescendant');
}

function closeTopicMenu(focus = true) {
  if (elements.topicMenu.hidden) return;
  elements.topicMenu.hidePopover(); elements.topicMenu.hidden = true;
  elements.topicTrigger.setAttribute('aria-expanded', 'false');
  if (focus) elements.topicTrigger.focus({ preventScroll: true });
}

function openTopicMenu() {
  if (!elements.topicMenu.hidden) { closeTopicMenu(); return; }
  elements.topicSearch.value = '';
  topicIndex = Math.max(0, topicChoices().findIndex((topic) => topic.id === elements.topicSelect.value));
  renderTopicOptions();
  const rect = elements.topicTrigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const upward = below < 180 && above > below;
  const height = Math.min(228, upward ? above : below);
  Object.assign(elements.topicMenu.style, { left: `${rect.left}px`, width: `${rect.width}px`, top: upward ? 'auto' : `${rect.bottom + 6}px`, bottom: upward ? `${window.innerHeight - rect.top + 6}px` : 'auto', maxHeight: `${height}px` });
  elements.topicOptions.style.maxHeight = `${Math.max(44, height - 62)}px`;
  elements.topicMenu.hidden = false; elements.topicMenu.showPopover();
  elements.topicTrigger.setAttribute('aria-expanded', 'true');
  elements.topicSearch.focus({ preventScroll: true });
  motion(elements.topicMenu, [{ opacity: 0, transform: `translateY(${upward ? 5 : -5}px)` }, { opacity: 1, transform: 'translateY(0)' }], 200);
}

function renderTopics(preferred = lastTopic) {
  closeTopicMenu(false);
  const chosen = topics.find((topic) => topic.id === preferred?.id || topic.name === preferred?.name)
    || topics.find((topic) => topic.name === '学习') || topics[0];
  elements.topicSelect.value = chosen?.id || '';
  elements.topicLabel.textContent = chosen?.name || '学习（保存时创建）';
}

function parseTags(value) {
  return value.split(/[,，\n]/).map((name) => name.trim()).filter(Boolean);
}

function renderTagSuggestions() {
  const query = elements.tagInput.value.trim().toLocaleLowerCase();
  const matches = tags.filter((tag) => !chosenTags.some((name) => name.toLocaleLowerCase() === tag.name.toLocaleLowerCase()) && tag.name.toLocaleLowerCase().includes(query)).slice(0, 5);
  elements.tagSuggestions.replaceChildren();
  elements.tagSuggestions.hidden = !matches.length || chosenTags.length >= MAX_TAGS;
  matches.forEach((tag) => {
    const button = document.createElement('button'); button.type = 'button';
    button.append(icon('tag'), document.createTextNode(tag.name));
    button.addEventListener('click', () => {
      if (addTags([tag.name])) elements.tagInput.value = '';
      renderTagSuggestions(); elements.tagInput.focus({ preventScroll: true }); persistInputs();
    });
    elements.tagSuggestions.append(button);
  });
}

function renderTags(added = []) {
  elements.tagNames.value = chosenTags.join('，');
  elements.tagCount.textContent = `${chosenTags.length} / ${MAX_TAGS}`;
  elements.tagChips.replaceChildren();
  chosenTags.forEach((name) => {
    const chip = document.createElement('span'); chip.className = 'tag-chip';
    const label = document.createElement('span'); label.textContent = name;
    const remove = document.createElement('button'); remove.type = 'button';
    remove.setAttribute('aria-label', `移除标签 ${name}`); remove.append(icon('close'));
    remove.addEventListener('click', () => {
      chosenTags = chosenTags.filter((tag) => tag !== name);
      clearTagFeedback(); renderTags();
      elements.tagInput.focus({ preventScroll: true }); persistInputs();
    });
    chip.append(label, remove); elements.tagChips.append(chip);
    if (added.includes(name)) motion(chip, [{ opacity: .25, transform: 'translateY(6px) rotate(-3deg) scale(.92)' }, { opacity: 1, transform: 'translateY(0) rotate(0) scale(1)' }], 240);
  });
  renderTagSuggestions();
  if (chosenTags.length > MAX_TAGS) tagError(`最多 ${MAX_TAGS} 个标签，请先移除多余标签再剪藏。`, 'legacy_limit');
  else if (elements.tagFeedback.dataset.reason === 'legacy_limit') clearTagFeedback();
}

function clearTagFeedback() {
  elements.tagFeedback.hidden = true;
  delete elements.tagFeedback.dataset.reason;
  elements.tagInput.removeAttribute('aria-invalid');
}

function tagError(message, reason) {
  elements.tagFeedback.textContent = message; elements.tagFeedback.hidden = false;
  elements.tagFeedback.dataset.reason = reason;
  elements.tagInput.setAttribute('aria-invalid', 'true');
  elements.tagFeedback.scrollIntoView({ block: 'nearest' });
}

function addTags(names) {
  const next = [...chosenTags];
  const added = [];
  for (const name of names) {
    if (!next.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) { next.push(name); added.push(name); }
  }
  if (next.length > MAX_TAGS || next.some((name) => name.length > 40)) {
    tagError(`最多 ${MAX_TAGS} 个标签，每个最多 40 个字。`, 'invalid');
    return false;
  }
  chosenTags = next; clearTagFeedback();
  renderTags(added); return true;
}

function commitTagInput() {
  if (!addTags(parseTags(elements.tagInput.value))) return false;
  elements.tagInput.value = ''; renderTagSuggestions(); return true;
}

async function refreshTags() {
  try { const result = await worker('tags'); if (authenticated) { tags = result.tags; renderTagSuggestions(); } }
  catch (error) { if (error.status === 401) await handleError(error); }
}

async function refreshTopics() {
  topicsReady = false;
  updateSaveButton();
  elements.refreshTopics.disabled = true;
  const preferred = elements.topicSelect.value ? { id: elements.topicSelect.value } : draftTopic || (preferences.topicStrategy === 'learning' ? { name: '学习' } : lastTopic);
  try {
    const response = await worker('topics');
    if (!authenticated) return;
    topics = response.topics;
    renderTopics(preferred);
    topicsReady = true;
  } catch (error) {
    if (!topics.length) elements.topicLabel.textContent = '分类加载失败，请重试';
    await handleError(error, refreshTopics);
  } finally {
    updateSaveButton();
  }
}

async function loadWorkspace(verifySession = true) {
  clearError();
  showPanel('clipPanel');
  updateSaveButton();
  if (verifySession) {
    setConnection('正在验证登录…');
    try { await worker('session'); sessionChecked = true; }
    catch (error) {
      if (error.status !== 401) { showPanel('connectionPanel'); setConnection('页息 · 连接未完成', 'error'); }
      await handleError(error, loadWorkspace);
      return;
    }
  } else sessionChecked = true;
  setConnection('已连接页息');
  const results = await Promise.allSettled([refreshTopics(), refreshContent(), refreshTags()]);
  for (const result of results) if (result.status === 'rejected') await handleError(result.reason, loadWorkspace);
}

function toggleNewTopic(open, focus = true) {
  elements.newTopicField.hidden = !open;
  closeTopicMenu(false);
  elements.topicTrigger.hidden = open;
  elements.newTopicToggle.textContent = open ? '选择已有分类' : '＋ 新分类';
  elements.newTopicToggle.setAttribute('aria-expanded', String(open));
  if (open && focus) elements.newTopicName.focus();
}

function showSaved(article, url) {
  const fresh = screen !== 'successPanel';
  const completedNow = pendingSave && handledSaveId !== article.id;
  savedArticleUrl = url;
  pendingSave = false;
  elements.successMessage.textContent = article.title;
  elements.successTopic.textContent = `已保存为草稿${article.topic ? ` · ${article.topic}` : ''}`;
  setConnection('已连接页息');
  buttonBusy(elements.clipButton, false, '剪藏');
  showPanel('successPanel');
  if (fresh) {
    const paper = elements.successPanel.querySelector('.saved-paper');
    motion(paper, [{ opacity: 0, transform: 'translateY(28px) scale(.7) rotate(-10deg)' }, { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)' }], 420);
    motion(paper.querySelector('svg'), [{ opacity: 0, transform: 'scale(.65)' }, { opacity: 1, transform: 'scale(1)' }], 450);
  }
  if (!busy) lockClipForm(false);
  updateSaveButton();
  if (completedNow) {
    handledSaveId = article.id;
    completeClip(url).catch((error) => showError(error));
  }
}

async function completeClip(url) {
  if (preferences.afterClip === 'open') await chrome.tabs.create({ url });
  if (preferences.afterClip === 'close') {
    if (inSidePanel) await worker('closePanel');
    else window.close();
  }
}

function applyPreferences(stored) {
  preferences = resolvePreferences(stored);
  document.documentElement.classList.toggle('reduce-motion', preferences.reduceMotion);
  if (preferences.reduceMotion) document.getAnimations().forEach((animation) => animation.cancel());
  elements.clipButton.title = preferences.saveShortcutEnabled ? '剪藏为草稿（Ctrl / Command + Enter）' : '剪藏为草稿';
  const label = elements.clipButton.querySelector('kbd');
  if (label) label.hidden = !preferences.saveShortcutEnabled;
}

async function startClipMode() {
  const stored = await chrome.storage.local.get('lastClipType');
  setMode(preferences.defaultClipType === 'recent'
    ? (clipTypes.includes(stored.lastClipType) ? stored.lastClipType : 'article')
    : preferences.defaultClipType);
}

function sourceHeader(data) {
  const escape = (value) => String(value).replace(/\s+/g, ' ').replace(/([\\\[\]*_`])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = escape(data.title);
  const url = data.url.replace(/\(/g, '%28').replace(/\)/g, '%29');
  const meta = [data.siteName, data.author, data.sourcePublishedAt?.slice(0, 10)].filter(Boolean).map(escape);
  return [`> 原文：[${title}](${url})`, ...(meta.length ? [`> 来源：${meta.join(' · ')}`] : [])].join('\n');
}

function exportDocument() {
  const title = elements.pageTitle.value.trim();
  if (!title) { elements.pageTitle.focus(); throw new Error('请填写导出标题。'); }
  if (!pageData || contentLoading) throw new Error('网页内容尚未读取完成。');
  const heading = title.replace(/([\\`*_\[\]])/g, '\\$1');
  const body = [sourceHeader(pageData), pageData.markdown].filter(Boolean).join('\n\n');
  return { title, markdown: `# ${heading}\n\n${body}`.trim() + '\n' };
}

async function exportCurrent(kind) {
  if (elements.exportMarkdownButton.disabled || elements.exportZipButton.disabled) return;
  clearError();
  let documentToExport;
  try { documentToExport = exportDocument(); }
  catch (error) { showError(error); return; }
  exporting = true;
  updateSaveButton();
  const markdownLabel = elements.exportMarkdownButton.textContent;
  const zipLabel = elements.exportZipButton.textContent;
  elements.exportMarkdownButton.textContent = kind === 'markdown' ? '正在导出…' : markdownLabel;
  elements.exportZipButton.textContent = kind === 'zip' ? '正在导出…' : zipLabel;
  try {
    if (kind === 'markdown') await exportMarkdownFile(documentToExport);
    else await exportZipFile(documentToExport);
  } catch (error) {
    showError(new Error('本地导出失败，请重试。'));
  } finally {
    exporting = false;
    elements.exportMarkdownButton.textContent = markdownLabel;
    elements.exportZipButton.textContent = zipLabel;
    updateSaveButton();
  }
}

function buildPayload() {
  const title = elements.pageTitle.value.trim();
  if (!title) { elements.pageTitle.focus(); throw new Error('请填写剪藏标题。'); }
  if (!pageData || contentLoading) throw new Error('网页内容尚未读取完成。');
  const newTopicName = !elements.newTopicField.hidden ? elements.newTopicName.value.trim() : '';
  if (!elements.newTopicField.hidden && !newTopicName) {
    elements.newTopicName.focus(); throw new Error('请填写新分类名称，或选择已有分类。');
  }
  const topicId = newTopicName ? null : elements.topicSelect.value;
  const topic = topics.find((item) => item.id === topicId);
  const topicName = newTopicName || (!topics.length ? '学习' : undefined);
  if (!commitTagInput()) { elements.tagInput.focus(); throw new Error('请调整标签后再剪藏。'); }
  const tagNames = [...chosenTags];
  const body = [sourceHeader(pageData), pageData.markdown].filter(Boolean).join('\n\n');
  return {
    captureUrl: pageData.captureUrl || activeTab.url,
    payload: {
      title, description: pageData.description || pageData.markdown.slice(0, 500), content: body,
      format: 'md', status: 'draft', language: pageData.language,
      author: pageData.author || 'Yohoia', topicId: topicId || null,
      ...(topicName ? { topicName } : {}),
      cover: pageData.coverUrl?.slice(0, 1000) || null, coverAlt: title, tagNames,
      sourceUrl: pageData.url.slice(0, 2048), sourceSiteName: pageData.siteName,
      sourceSiteIconUrl: pageData.siteIconUrl?.slice(0, 1000) || null,
      sourcePublishedAt: pageData.sourcePublishedAt, clipType: selectedMode(),
      wordCount: pageData.wordCount, readingTimeMinutes: pageData.readingTimeMinutes,
    },
    topic: topicId ? { id: topicId, name: topic?.name } : { name: topicName },
  };
}

async function persistInputs() {
  try { await storeDraft(); } catch (error) { showError(error); }
}

function lockClipForm(locked) {
  closeTopicMenu(false);
  elements.clipForm.querySelectorAll('input, select, button').forEach((element) => { element.disabled = locked; });
  elements.pageTitle.disabled = locked;
  if (!locked) elements.selectionMode.disabled = !pageData?.hasSelection;
  updateSaveButton();
}

codeInputs.forEach((input, index) => {
  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    if (digits.length > 1) { pasteCode(digits); return; }
    input.value = digits.slice(-1);
    codeInputs.forEach((field) => field.removeAttribute('aria-invalid'));
    updateLoginButton();
    if (input.value) focusDigit(index + 1);
  });
  input.addEventListener('paste', (event) => {
    event.preventDefault();
    if (!busy) pasteCode(event.clipboardData.getData('text'));
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !input.value && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    } else if (event.key === 'ArrowRight' && index < codeInputs.length - 1) {
      event.preventDefault();
      focusDigit(index + 1);
    }
  });
});
elements.showCode.addEventListener('click', () => {
  const show = codeInputs[0].type === 'password';
  codeInputs.forEach((input) => { input.type = show ? 'text' : 'password'; });
  elements.showCode.setAttribute('aria-pressed', String(show));
  elements.showCode.setAttribute('aria-label', show ? '隐藏访问码' : '显示访问码');
});
elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !/^\d{6}$/.test(accessCode())) return;
  clearError();
  busy = true;
  codeInputs.forEach((input) => { input.disabled = true; });
  elements.showCode.disabled = true;
  buttonBusy(elements.loginButton, true, '正在登录…');
  updateSaveButton();
  try {
    await worker('login', { accessCode: accessCode(), remember: elements.remember.checked });
    clearCode();
    authenticated = true;
    await startClipMode();
    await readDraft();
    await loadWorkspace(false);
  } catch (error) {
    codeInputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
    if (error.message === 'invalid_access_code') clearCode();
    motion(elements.accessCode, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)', offset: .25 }, { transform: 'translateX(4px)', offset: .55 }, { transform: 'translateX(0)' }], 260);
    setConnection('登录未完成', 'error');
    showError(error);
  } finally {
    busy = false;
    codeInputs.forEach((input) => { input.disabled = false; });
    elements.showCode.disabled = false;
    buttonBusy(elements.loginButton, false, '登录页息');
    updateSaveButton();
    if (!authenticated && !accessCode()) focusDigit(0);
  }
});

elements.clipForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (elements.clipButton.disabled) return;
  clearError();
  let request;
  try { request = buildPayload(); await storeDraft(); }
  catch (error) { showError(error); return; }
  busy = true;
  pendingSave = true;
  buttonBusy(elements.clipButton, true, '正在剪藏…');
  lockClipForm(true);
  try {
    const result = await worker('createArticle', { ...request, tabId: activeTab.id });
    showSaved(result.article, result.articleUrl);
    if (result.warning) showError(result.warning);
  } catch (error) {
    pendingSave = false;
    if (error.message === 'database_not_configured') showError('暂时无法保存到页息，内容已保留，请稍后重试。');
    else await handleError(error);
  } finally {
    busy = false;
    pendingSave = false;
    buttonBusy(elements.clipButton, false, '剪藏');
    lockClipForm(false);
  }
});

elements.exportMarkdownButton.addEventListener('click', () => exportCurrent('markdown'));
elements.exportZipButton.addEventListener('click', () => exportCurrent('zip'));

document.querySelectorAll('input[name="clipType"]').forEach((input) => {
  input.addEventListener('change', async () => {
    clearError();
    const refreshing = refreshContent();
    await Promise.allSettled([persistInputs(), refreshing, chrome.storage.local.set({ lastClipType: selectedMode() })]);
  });
});
elements.pageTitle.addEventListener('input', () => { elements.pageTitle.title = elements.pageTitle.value; updateSaveButton(); });
elements.pageTitle.addEventListener('blur', () => { elements.pageTitle.scrollLeft = 0; });
for (const id of ['pageTitle', 'newTopicName']) elements[id].addEventListener('input', persistInputs);
elements.topicTrigger.addEventListener('click', openTopicMenu);
elements.topicSearch.addEventListener('input', () => { topicIndex = 0; renderTopicOptions(); });
elements.topicMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); closeTopicMenu(); }
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const count = topicChoices().length;
    if (event.key === 'Home') topicIndex = 0;
    else if (event.key === 'End') topicIndex = count - 1;
    else topicIndex = Math.max(0, Math.min(count - 1, topicIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    renderTopicOptions(); elements.topicOptions.children[topicIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') { event.preventDefault(); elements.topicOptions.children[topicIndex]?.click(); }
  else if (event.key === 'Tab') closeTopicMenu(false);
});
document.addEventListener('pointerdown', (event) => {
  if (!elements.topicMenu.hidden && !elements.topicMenu.contains(event.target) && !elements.topicTrigger.contains(event.target)) closeTopicMenu(false);
});
document.querySelector('main').addEventListener('scroll', () => closeTopicMenu(false));
window.addEventListener('resize', () => closeTopicMenu(false));
elements.tagInput.addEventListener('input', (event) => {
  if (!event.isComposing && /[,，\n]/.test(elements.tagInput.value)) commitTagInput();
  renderTagSuggestions(); persistInputs();
});
elements.tagInput.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); commitTagInput(); persistInputs(); }
  else if (event.key === 'Backspace' && !elements.tagInput.value && chosenTags.length) {
    chosenTags.pop(); clearTagFeedback(); renderTags(); persistInputs();
  } else if (event.key === 'Escape' && !elements.tagSuggestions.hidden) { event.preventDefault(); elements.tagSuggestions.hidden = true; }
});
elements.newTopicToggle.addEventListener('click', async () => { toggleNewTopic(elements.newTopicField.hidden); await persistInputs(); });
elements.refreshTopics.addEventListener('click', async () => { clearError(); await refreshTopics(); });
elements.retryButton.addEventListener('click', async () => {
  const action = retryAction;
  clearError();
  if (action) { try { await action(); } catch (error) { await handleError(error, action); } }
});

elements.logoutButton.addEventListener('click', async () => {
  if (busy || pendingSave) return;
  busy = true;
  updateSaveButton();
  try {
    const result = await worker('logout');
    pageData = null;
    elements.pageTitle.value = '';
    chosenTags = []; tags = []; elements.tagInput.value = ''; renderTags();
    elements.newTopicName.value = '';
    toggleNewTopic(false);
    await startClipMode();
    clearError();
    loginScreen('已退出登录');
    if (result.serverError) showError('已退出此设备；暂时无法撤销服务器会话，该会话将在到期后失效。');
  } catch (error) { showError(error); }
  finally { busy = false; updateSaveButton(); }
});

document.addEventListener('keydown', (event) => {
  if (screen === 'aboutPanel' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    return;
  }
  if (screen === 'aboutPanel' && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault();
    returnToClip();
    return;
  }
  if (inSidePanel && event.key === 'Escape' && !event.defaultPrevented && event.target.tagName !== 'SELECT') {
    event.preventDefault();
    worker('closePanel').catch((error) => showError(error));
  }
  if (preferences.saveShortcutEnabled && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && screen === 'clipPanel' && !elements.clipButton.disabled) {
    event.preventDefault();
    elements.clipForm.requestSubmit();
  }
});
elements.aboutButton.addEventListener('click', () => {
  if (screen !== 'clipPanel' || busy || pendingSave) return;
  closeTopicMenu(false);
  clipScrollPosition = document.querySelector('main').scrollTop;
  showPanel('aboutPanel');
  document.querySelector('main').scrollTop = 0;
  elements.backToClipButton.focus({ preventScroll: true });
});
function returnToClip() {
  showPanel('clipPanel');
  document.querySelector('main').scrollTop = clipScrollPosition;
  elements.aboutButton.focus({ preventScroll: true });
}
elements.backToClipButton.addEventListener('click', returnToClip);

elements.closePanelButton.addEventListener('click', () => { worker('closePanel').catch((error) => showError(error)); });
elements.openArticleButton.addEventListener('click', async () => {
  try { if (savedArticleUrl) await chrome.tabs.create({ url: savedArticleUrl }); }
  catch (error) { showError(error); }
});
elements.clipAnotherButton.addEventListener('click', async () => {
  clearError();
  try {
    await chrome.storage.local.remove('saveJob');
    showPanel('clipPanel');
    await refreshTopics();
    await refreshContent();
  } catch (error) { await handleError(error); }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.preferences) applyPreferences(changes.preferences.newValue);
  const job = changes.saveJob?.newValue;
  if (area !== 'local' || !job || job.tabId !== activeTab?.id || !authenticated) return;
  if (job.status === 'success') { clearError(); showSaved(job.article, job.articleUrl); }
  if (job.status === 'error' && pendingSave && !busy) {
    pendingSave = false;
    buttonBusy(elements.clipButton, false, '剪藏');
    lockClipForm(false);
    showError(new Error(job.error));
  }
});

async function initialize() {
  const [state, context, storedPreferences] = await Promise.all([worker('getState'), worker('getContext'), chrome.storage.local.get('preferences')]);
  applyPreferences(storedPreferences.preferences);
  await startClipMode();
  lastTopic = state.lastTopic;
  activeTab = context.tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
  if (!state.auth?.authenticated) { loginScreen(); return; }
  authenticated = true;
  await readDraft();
  if (state.saveJob?.tabId === activeTab?.id && state.saveJob.status === 'success') {
    // Verify the session before exposing a previous result on reopening.
    try { await worker('session'); sessionChecked = true; }
    catch (error) {
      if (error.status !== 401) { showPanel('connectionPanel'); setConnection('页息 · 连接未完成', 'error'); }
      await handleError(error, initialize);
      return;
    }
    showSaved(state.saveJob.article, state.saveJob.articleUrl);
    return;
  }
  if (state.saveJob?.status === 'saving') {
    if (state.saveJob.tabId === activeTab?.id) {
      pendingSave = true;
      buttonBusy(elements.clipButton, true, '正在剪藏…');
      // Recheck a restored pending result if the worker was interrupted.
      setTimeout(async () => {
        if (!pendingSave) return;
        try {
          const latest = await worker('getState');
          const job = latest.saveJob;
          if (job?.status === 'success') { showSaved(job.article, job.articleUrl); return; }
          if (job?.status === 'error') {
            pendingSave = false;
            buttonBusy(elements.clipButton, false, '剪藏');
            lockClipForm(false);
            showError(new Error(job.error));
          }
        } catch (error) { showError(error); }
      }, Math.max(1000, 91_000 - (Date.now() - state.saveJob.startedAt)));
    }
  }
  await loadWorkspace();
  if (pendingSave) {
    const latest = await worker('getState');
    if (latest.saveJob?.status === 'success') { showSaved(latest.saveJob.article, latest.saveJob.articleUrl); return; }
    if (latest.saveJob?.status === 'error') {
      pendingSave = false;
      buttonBusy(elements.clipButton, false, '剪藏');
      showError(new Error(latest.saveJob.error));
    }
  }
  if (pendingSave) lockClipForm(true);
  if (state.saveJob?.tabId === activeTab?.id && state.saveJob.status === 'error') showError(new Error(state.saveJob.error));
}

initialize().catch((error) => { loginScreen('初始化未完成'); showError(error, initialize); });
