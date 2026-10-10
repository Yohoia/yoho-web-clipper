// Browser-only panel fixtures; the production manifest never includes these files.
(() => {
  let closeListener;
  const state = new URLSearchParams(location.search).get('state') || 'clip';
  const view = new URLSearchParams(location.search).get('view');
  window.chrome = { runtime: {
    id: 'preview-extension',
    getURL() { return `${location.origin}/preview?surface=panel&state=${encodeURIComponent(state)}${view === 'about' ? '&view=about' : ''}${['save-error', 'saving', 'save-flow'].includes(state) ? '&autoclip=1' : ''}`; },
    onMessage: { addListener(listener) { closeListener = listener; } },
  } };
  window.addEventListener('message', (event) => {
    const iframe = document.querySelector('#shiye-clipper-panel')?.shadowRoot?.querySelector('iframe');
    if (event.origin !== location.origin || event.source !== iframe?.contentWindow || event.data !== 'shiye-preview-close') return;
    closeListener?.({ type: 'yohoClipper:closePagePanel' }, { id: 'preview-extension' }, () => {});
  });
  document.getElementById('previewToolbar').addEventListener('click', () => window.__shiyePanel.toggle());
})();
