import { viewerPageHtml } from './viewer-page-assets.mjs';

/** A read-only still camera. No inventory, chat history, controls or extra account. */
export async function viewerPhotoPage(root) {
  const page = await viewerPageHtml(root, 'first', '');
  if (!page.includes('/index.js')) throw Error('PHOTO_VIEWER_ASSETS_MISSING');
  return page.replace('</head>', `<style>
    body > :not(#viewer-canvas):not(script):not(style) { display:none !important }
    #viewer-canvas { position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important }
  </style></head>`).replace('</body>', `<script>
    globalThis.__photoSkinTasks = new Set();
    globalThis.__photoSkinFailed = false;
    // The consumer must also wait for its authenticated native camera lease.
    globalThis.__photoReady = () => {
      const d = globalThis.__lanternRenderer?.chunkLoading;
      const canvas = document.getElementById('viewer-canvas');
      return Boolean(globalThis.__lanternRenderer?.photoMode === true
        && canvas?.width && canvas?.height && d?.received >= 25
        && d.meshed >= 25 && d.masked === 0 && d.pendingSections === 0
        && __photoSkinTasks.size === 0 && !__photoSkinFailed
        && document.fonts.status === 'loaded');
    };
  </script></body>`);
}
