import { DEFAULT_SETTINGS } from './config.js';

// Shared product information for the panel and the browser's extension details entry.
export function mountAbout(container, { embedded = false } = {}) {
  container.innerHTML = `    <header class="cover-heading"><h1>关于拾页</h1></header>
    <div class="seal"><img id="brandMark" class="logo" src="../icons/icon-128.png" width="60" height="60" alt="拾页 Logo" /></div>
    <div class="identity"><p class="name">拾页</p><p class="subtitle">PageHush Clipper</p></div>
    <p class="motto">拾起灵感，留住好文章。</p>
    <p class="description">剪藏网页，保存到页息。</p>
    <a class="product-link" href="https://pagehush.yohoia.cn/" target="_blank" rel="noopener">打开页息<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
    <p id="serviceAddress" class="service-address">pagehush.yohoia.cn</p>
    <dl class="facts">
      <div><dt>版本</dt><dd id="version">—</dd></div>
      <div><dt>保存位置</dt><dd>页息 PageHush</dd></div>
      <div><dt>内容格式</dt><dd>Markdown</dd></div>
      <div><dt>剪藏后状态</dt><dd>草稿</dd></div>
    </dl>
    <section class="info-section"><h2>剪藏方式</h2><div class="clip-kinds"><div class="clip-kind"><svg aria-hidden="true"><use href="#i-article"/></svg><span>网页正文</span></div><div class="clip-kind"><svg aria-hidden="true"><use href="#i-page"/></svg><span>整个网页</span></div><div class="clip-kind"><svg aria-hidden="true"><use href="#i-text"/></svg><span>纯文字</span></div><div class="clip-kind"><svg aria-hidden="true"><use href="#i-selection"/></svg><span>选中内容</span></div><div class="clip-kind"><svg aria-hidden="true"><use href="#i-link"/></svg><span>书签</span></div><div class="clip-kind"><svg aria-hidden="true"><use href="#i-camera"/></svg><span>屏幕截图</span></div></div></section>
    <section class="info-section privacy"><h2>登录与隐私</h2><p>使用页息的 6 位访问码登录，扩展不保存访问码。</p><p>打开剪藏工具后读取当前网页；点击剪藏后，才保存到页息。</p></section>
`;
  if (embedded) {
    container.querySelector('.cover-heading').remove();
    container.querySelector('.description').remove();
  }
  container.querySelector('#version').textContent = chrome.runtime.getManifest().version;
  container.querySelector('.product-link').href = DEFAULT_SETTINGS.webBaseUrl + '/';
  container.querySelector('#serviceAddress').textContent = new URL(DEFAULT_SETTINGS.webBaseUrl).hostname;
}
