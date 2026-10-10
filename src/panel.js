(() => {
  // This bridge is injected only after a toolbar click, in Chrome's isolated world.
  if (globalThis.__shiyePanel) { globalThis.__shiyePanel.toggle(); return; }
  let host = null;
  let previousFocus = null;
  let captureRestoreTimer;

  function close() {
    if (!host) return;
    clearTimeout(captureRestoreTimer);
    host.remove();
    host = null;
    previousFocus?.focus?.({ preventScroll: true });
    previousFocus = null;
  }

  function open() {
    previousFocus = document.activeElement;
    host = document.createElement('div');
    host.id = 'shiye-clipper-panel';
    host.setAttribute('data-shiye-ui', '');
    const declarations = {
      all: 'initial', position: 'fixed', display: 'block', top: '12px', right: '12px',
      bottom: '12px', left: 'auto', width: '340px', 'max-width': 'calc(100vw - 24px)',
      height: 'auto', margin: '0', padding: '0', border: '1px solid #dedfd5',
      'border-radius': '2px', overflow: 'hidden', 'box-sizing': 'border-box',
      'z-index': '2147483647', background: '#f7f6f1',
      'box-shadow': '0 12px 48px #18241c26, 0 2px 8px #18241c12',
      'color-scheme': 'light', transform: 'none', visibility: 'visible', opacity: '1',
    };
    for (const [property, value] of Object.entries(declarations)) {
      host.style.setProperty(property, value, ['all', 'opacity'].includes(property) ? '' : 'important');
    }
    // Isolate the panel's controls from the current site's styles.
    const shadow = host.attachShadow({ mode: 'open' });
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup/popup.html?surface=panel');
    iframe.title = '拾页 PageHush Clipper';
    iframe.allow = 'clipboard-write';
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#f7f6f1;color-scheme:light;';
    shadow.append(iframe);
    document.documentElement.append(host);
    const openedHost = host;
    const stored = chrome.storage?.local?.get('preferences') || Promise.resolve({});
    stored.then(({ preferences }) => {
      if (host !== openedHost || !openedHost.isConnected || preferences?.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      openedHost.animate([{ opacity: 0, translate: '16px 0' }, { opacity: 1, translate: '0 0' }],
        { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
    }).catch(() => {});
  }

  const toggle = () => { if (host?.isConnected) close(); else open(); };
  globalThis.__shiyePanel = { toggle, close };
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.type === 'yohoClipper:prepareScreenshot') {
      host?.style.setProperty('visibility', 'hidden', 'important');
      // Restore even if the worker is interrupted during capture.
      clearTimeout(captureRestoreTimer);
      captureRestoreTimer = setTimeout(() => host?.style.setProperty('visibility', 'visible', 'important'), 4000);
      requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
      return true;
    }
    if (message?.type === 'yohoClipper:restoreScreenshot') {
      clearTimeout(captureRestoreTimer);
      host?.style.setProperty('visibility', 'visible', 'important');
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type !== 'yohoClipper:closePagePanel') return false;
    close();
    sendResponse({ ok: true });
    return false;
  });
  document.addEventListener('keydown', (event) => {
    if (host && event.key === 'Escape' && !event.defaultPrevented) close();
  });
  open();
})();
