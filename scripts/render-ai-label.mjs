// Renders the AI-generated label (lib/server/aiLabel.ts): node scripts/render-ai-label.mjs label.png,
// then: sharp label.png -> png({ palette: true }) -> base64 into lib/server/aiLabel.ts.
import { chromium } from 'playwright'
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1 })
  await p.setContent(`<html><body style="margin:0;background:transparent">
  <div id="l" style="display:inline-flex;align-items:center;gap:14px;padding:12px 26px 12px 20px;border-radius:999px;background:rgba(20,12,16,.72);color:#fff;font:600 34px/1.1 'DejaVu Sans','Liberation Sans',Arial,sans-serif;letter-spacing:.3px;white-space:nowrap">
  <svg width="34" height="34" viewBox="0 0 24 24"><path fill="#ffd166" d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z"/></svg>
  <span>AI-generated · PottuPaarkalaam</span></div></body></html>`)
  await p.locator('#l').screenshot({ path: process.argv[2], omitBackground: true })
  await b.close()
})()
