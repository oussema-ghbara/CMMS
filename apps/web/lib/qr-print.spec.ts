/**
 * Unit tests for QR code print utilities (§2.8)
 *
 * Covers:
 * - buildQrPrintHtml: includes asset name in HTML
 * - buildQrPrintHtml: includes identifier in HTML
 * - buildQrPrintHtml: includes injected SVG markup
 * - buildQrPrintHtml: escapes HTML-special characters in asset name
 * - buildQrPrintHtml: escapes HTML-special characters in identifier
 * - buildQrPrintHtml: includes auto-print script
 * - buildQrPrintHtml: result is valid HTML (DOCTYPE, html, head, body)
 * - buildQrPrintHtml: SVG container has fixed width/height via CSS
 */

import { buildQrPrintHtml } from './qr-print';

const STUB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200"/></svg>';

describe('buildQrPrintHtml', () => {
  it('includes the asset name in the output HTML', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Compresseur A' }, STUB_SVG);
    expect(html).toContain('Compresseur A');
  });

  it('includes the identifier in the output HTML', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Compresseur A' }, STUB_SVG);
    expect(html).toContain('QR-001');
  });

  it('injects the SVG markup verbatim', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });

  it('escapes < and > in the asset name so XSS payload is neutralised', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: '<script>alert(1)</script>' }, STUB_SVG);
    // The escaped tag should appear in the content (class="asset-name") but never execute
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // The raw unescaped payload must not appear as a standalone tag in content
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes < and > in the identifier', () => {
    const html = buildQrPrintHtml({ identifier: '<evil>', assetName: 'Asset' }, STUB_SVG);
    expect(html).not.toContain('<evil>');
    expect(html).toContain('&lt;evil&gt;');
  });

  it('includes window.print() auto-trigger script', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('window.print()');
  });

  it('produces a complete HTML document with DOCTYPE, html, head, and body', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('includes print media query in the stylesheet', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('@media print');
  });

  it('sets SVG width and height to 200px via CSS', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('width: 200px');
    expect(html).toContain('height: 200px');
  });

  it('uses fr lang attribute on the html element', () => {
    const html = buildQrPrintHtml({ identifier: 'QR-001', assetName: 'Test' }, STUB_SVG);
    expect(html).toContain('lang="fr"');
  });
});
