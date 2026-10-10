(() => {
  if (globalThis.__yohoClipperContentLoaded) return;
  globalThis.__yohoClipperContentLoaded = true;
  const MAX_CONTENT_LENGTH = 500_000;

  const REMOVED_SELECTORS = [
    '[data-shiye-ui]',
    'script',
    'style',
    'noscript',
    'iframe',
    'form',
    'button',
    'input',
    'select',
    'textarea',
    'nav',
    'aside',
    'footer',
    '[aria-hidden="true"]',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.sidebar',
    '.comments',
    '.comment-list',
    '.related-posts',
    '.share-buttons',
    '.social-share',
    '.ad',
    '.ads',
    '.advert',
  ];

  function metaContent(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element?.getAttribute('content')?.trim();
      if (value) return value;
    }
    return null;
  }

  function absoluteUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function pageTitle() {
    return (
      metaContent([
        'meta[property="og:title"]',
        'meta[name="og:title"]',
        'meta[name="twitter:title"]',
      ]) ||
      document.querySelector('h1')?.textContent?.trim() ||
      document.title ||
      '无标题网页'
    );
  }

  function pageDescription() {
    const description = metaContent([
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]);
    if (description) return description;

    const paragraph = Array.from(document.querySelectorAll('p'))
      .map((element) => element.textContent?.trim() || '')
      .find((value) => value.length > 30);
    return paragraph || '';
  }

  function canonicalUrl() {
    const canonical = absoluteUrl(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    );
    return canonical || location.href;
  }

  function siteName() {
    const name =
      metaContent(['meta[property="og:site_name"]', 'meta[name="application-name"]']) ||
      location.hostname;
    return name.replace(/^www\./, '');
  }

  function faviconUrl() {
    const icon = document.querySelector(
      'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]',
    );
    return absoluteUrl(icon?.getAttribute('href'));
  }

  function authorName() {
    const author =
      metaContent([
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="twitter:creator"]',
      ]) ||
      document.querySelector('[rel="author"], .author, .byline, [itemprop="author"]')?.textContent?.trim() ||
      null;
    if (!author) return null;
    return author.replace(/^by\s*/i, '').trim().slice(0, 80) || null;
  }

  function coverUrl() {
    const raw =
      metaContent([
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
      ]) ||
      document.querySelector('article img, main img, .article-content img')?.getAttribute('src') ||
      null;
    return absoluteUrl(raw);
  }

  function publishedAt() {
    const value =
      metaContent([
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="publish-date"]',
      ]) ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      null;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function language() {
    const value = document.documentElement.lang || metaContent(['meta[name="content-language"]']);
    if (/^zh/i.test(value || '')) return 'zh';
    if (/^en/i.test(value || '')) return 'en';
    return /[\u4e00-\u9fff]/.test(document.body?.innerText || '') ? 'zh' : 'en';
  }

  function isHidden(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;
    const style = element.style;
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      (style.opacity !== '' && Number(style.opacity) === 0)
    );
  }

  function resolveImageUrl(image) {
    const candidates = [
      image.getAttribute('data-src'),
      image.getAttribute('data-original'),
      image.getAttribute('data-lazy-src'),
      image.getAttribute('data-srcset'),
      image.getAttribute('src'),
      image.getAttribute('srcset'),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const first = candidate.split(',').at(0)?.trim().split(/\s+/).at(0);
      const url = absoluteUrl(first);
      if (url) return url;
    }
    return null;
  }

  function cleanNode(root, clipType) {
    const selectors = clipType === 'full_page' ? REMOVED_SELECTORS.slice(0, 10) : REMOVED_SELECTORS;
    const container = document.createElement('div');
    container.append(root.cloneNode(true));

    for (const element of Array.from(container.querySelectorAll('*'))) {
      if (selectors.some((selector) => element.matches(selector)) || isHidden(element)) {
        element.remove();
        continue;
      }

      if (clipType === 'simplified' && element.tagName === 'IMG') { element.remove(); continue; }
      if (element.tagName === 'IMG') {
        const url = resolveImageUrl(element);
        if (!url) {
          element.remove();
          continue;
        }
        element.setAttribute('src', url);
        element.removeAttribute('srcset');
      } else if (element.tagName === 'A') {
        const url = absoluteUrl(element.getAttribute('href'));
        if (!url) element.removeAttribute('href');
        else element.setAttribute('href', url);
      }
    }

    for (const attribute of ['src', 'href']) {
      for (const element of container.querySelectorAll(`[${attribute}]`)) {
        const value = absoluteUrl(element.getAttribute(attribute));
        if (!value) element.removeAttribute(attribute);
        else element.setAttribute(attribute, value);
      }
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    for (const comment of comments) comment.remove();

    return container;
  }

  function articleRoot() {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.article-content',
      '.article-body',
      '.post-content',
      '.entry-content',
      '.markdown-body',
      '#content',
    ];
    let best = document.body;
    let bestScore = 0;

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (isHidden(element)) continue;
        const text = element.textContent?.trim() || '';
        const links = element.querySelectorAll('a').length;
        const score = text.length - links * 20;
        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
    }

    return best || document.body;
  }

  function selectedRoot() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.append(fragment);
    return container;
  }

  function escapeText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`');
  }

  function escapeTableCell(value) {
    return String(value || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>');
  }

  function markdownUrl(value) {
    return String(value || '').replace(/\(/g, '%28').replace(/\)/g, '%29');
  }

  function isBlockTag(tagName) {
    return [
      'ADDRESS',
      'ARTICLE',
      'ASIDE',
      'BLOCKQUOTE',
      'DETAILS',
      'DIV',
      'DL',
      'DD',
      'DT',
      'FIGURE',
      'FIGCAPTION',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'HEADER',
      'HR',
      'LI',
      'MAIN',
      'NAV',
      'FOOTER',
      'OL',
      'P',
      'PRE',
      'SECTION',
      'SUMMARY',
      'TABLE',
      'UL',
    ].includes(tagName);
  }

  function childrenToMarkdown(node) {
    return Array.from(node.childNodes)
      .map((child) => nodeToMarkdown(child))
      .join('');
  }

  function inlineChildrenToMarkdown(node) {
    return childrenToMarkdown(node).replace(/\s+/g, ' ').trim();
  }

  function tableToMarkdown(element) {
    const rows = Array.from(element.querySelectorAll('tr'));
    if (!rows.length) return '';

    const table = rows.map((row) =>
      Array.from(row.querySelectorAll('th,td')).map((cell) =>
        escapeTableCell(inlineChildrenToMarkdown(cell)),
      ),
    );
    const width = Math.max(...table.map((row) => row.length));
    const normalized = table.map((row) => {
      const copy = [...row];
      while (copy.length < width) copy.push('');
      return copy;
    });
    const header = normalized[0];
    const separator = header.map(() => '---');
    const body = normalized.slice(1);
    return `\n\n${[header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`;
  }

  function listToMarkdown(element, ordered) {
    const items = Array.from(element.children).filter((child) => child.tagName === 'LI');
    const start = Number.parseInt(element.getAttribute('start') || '1', 10) || 1;
    const output = items.map((item, index) => {
      const prefix = ordered ? `${start + index}. ` : '- ';
      const content = childrenToMarkdown(item).trim().replace(/\n{3,}/g, '\n\n');
      const lines = content.split('\n');
      return prefix + lines[0] + lines.slice(1).map((line) => `\n${' '.repeat(prefix.length)}${line}`).join('');
    });
    return `\n\n${output.join('\n')}\n\n`;
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || '';
      // Ordinary HTML whitespace collapses; code/pre whitespace is handled separately.
      return escapeText(value.replace(/\s+/g, ' '))
        .replace(/([\[\]*_])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node;
    const tag = element.tagName;

    switch (tag) {
      case 'H1': return `\n\n# ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'H2': return `\n\n## ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'H3': return `\n\n### ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'H4': return `\n\n#### ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'H5': return `\n\n##### ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'H6': return `\n\n###### ${inlineChildrenToMarkdown(element)}\n\n`;
      case 'BR': return '\n';
      case 'HR': return '\n\n---\n\n';
      case 'STRONG': case 'B': {
        const value = inlineChildrenToMarkdown(element);
        return value ? `**${value}**` : '';
      }
      case 'EM': case 'I': {
        const value = inlineChildrenToMarkdown(element);
        return value ? `*${value}*` : '';
      }
      case 'DEL': case 'S': {
        const value = inlineChildrenToMarkdown(element);
        return value ? `~~${value}~~` : '';
      }
      case 'CODE': {
        const value = element.textContent || '';
        if (!value) return '';
        const fence = '`'.repeat(Math.max(1, ...(value.match(/`+/g) || []).map((run) => run.length + 1)));
        const padding = /^[` ]|[` ]$/.test(value) ? ' ' : '';
        return `${fence}${padding}${value}${padding}${fence}`;
      }
      case 'PRE': {
        const code = element.querySelector('code');
        const source = (code || element).textContent || '';
        const fenceLength = Math.max(3, ...source.match(/`+/g)?.map((value) => value.length + 1) ?? [3]);
        return `\n\n${'`'.repeat(fenceLength)}\n${source.replace(/\s+$/, '')}\n${'`'.repeat(fenceLength)}\n\n`;
      }
      case 'A': {
        const href = absoluteUrl(element.getAttribute('href'));
        const value = inlineChildrenToMarkdown(element);
        if (!value) return '';
        return href ? `[${value}](${markdownUrl(href)})` : value;
      }
      case 'IMG': {
        const src = absoluteUrl(resolveImageUrl(element));
        const alt = escapeTableCell(element.getAttribute('alt') || '').replace(/([\\\[\]])/g, '\\$1');
        return src ? `![${alt}](${markdownUrl(src)})` : '';
      }
      case 'BLOCKQUOTE': {
        const value = childrenToMarkdown(element).trim();
        return value ? `\n\n${value.split('\n').map((line) => `> ${line}`).join('\n')}\n\n` : '';
      }
      case 'UL': return listToMarkdown(element, false);
      case 'OL': return listToMarkdown(element, true);
      case 'TABLE': return tableToMarkdown(element);
      case 'FIGCAPTION': {
        const value = inlineChildrenToMarkdown(element);
        return value ? `\n\n*${value}*\n\n` : '';
      }
      case 'SVG': case 'CANVAS': case 'VIDEO': case 'AUDIO': return '';
      default: {
        const value = childrenToMarkdown(element);
        if (!value.trim()) return '';
        return isBlockTag(tag) ? `\n\n${value.trim()}\n\n` : value;
      }
    }
  }

  function normalizeMarkdown(value) {
    // Normalize only outside fences, preserving indentation and blank lines in code.
    let fence = null;
    let blankLines = 0;
    const output = [];
    for (const line of String(value || '').split('\n')) {
      const marker = line.trim().match(/^(`{3,})(?:[^`]*$)/);
      if (marker && (!fence || marker[1].length >= fence.length)) {
        fence = fence ? null : marker[1];
        blankLines = 0;
        output.push(line);
        continue;
      }
      if (fence) { output.push(line); continue; }
      if (!line.trim()) {
        blankLines += 1;
        if (blankLines <= 1) output.push('');
      } else {
        blankLines = 0;
        output.push(line.replace(/[ \t]+$/, ''));
      }
    }
    return output.join('\n').trim();
  }

  function textStats(value) {
    const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (value.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    const wordCount = cjk + words;
    return { wordCount, readingTimeMinutes: Math.max(1, Math.round(wordCount / 300)) };
  }

  function extract(clipType) {
    const hasSelection = Boolean(selectedRoot());
    const requestedType = clipType;
    let effectiveType = clipType;
    if (clipType === 'selection' && !hasSelection) {
      throw new Error('请先选中要剪藏的内容');
    }
    if (clipType === 'article' && !articleRoot()) effectiveType = 'article';

    if (!['article', 'selection', 'bookmark', 'full_page', 'simplified', 'screenshot'].includes(clipType)) throw new Error('无法识别剪藏方式');
    const metadataOnly = ['bookmark', 'screenshot'].includes(requestedType);
    const rawRoot = requestedType === 'selection' ? selectedRoot() : requestedType === 'full_page' ? document.body : articleRoot();
    const cleaned = cleanNode(metadataOnly ? document.createElement('div') : rawRoot, requestedType);
    const bodyMarkdown = metadataOnly ? '' : normalizeMarkdown(nodeToMarkdown(cleaned));
    if (bodyMarkdown.length > MAX_CONTENT_LENGTH) throw new Error('正文过长，请选中需要的部分后使用「选中内容」剪藏');
    if (!metadataOnly && !bodyMarkdown) throw new Error('未找到可剪藏的正文，请选择文字或改用书签');
    const description = pageDescription().slice(0, 500);
    const stats = textStats(bodyMarkdown || description);

    const markdown =
      requestedType === 'bookmark'
        ? normalizeMarkdown(description ? `> ${escapeText(description).replace(/([\[\]*_])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : '')
        : bodyMarkdown;

    return {
      url: canonicalUrl(),
      title: pageTitle().replace(/\s+/g, ' ').trim().slice(0, 200),
      description,
      siteName: siteName().slice(0, 120),
      siteIconUrl: faviconUrl(),
      coverUrl: ['simplified', 'screenshot'].includes(clipType) ? null : coverUrl(),
      captureUrl: location.href,
      author: authorName(),
      sourcePublishedAt: publishedAt(),
      language: language(),
      clipType: effectiveType,
      markdown,
      hasSelection,
      ...stats,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'yohoClipper:extract') return false;
    try {
      sendResponse({ ok: true, data: extract(message.clipType) });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || '无法解析当前页面' });
    }
    return false;
  });
})();
