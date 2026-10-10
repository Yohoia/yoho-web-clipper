// Read-only browser preview; production options never load this file.
(() => {
  window.chrome = {
    runtime: { getManifest: () => ({ version: '0.5.4' }) },
    storage: { local: { async get() { return {}; } } },
  };
})();
