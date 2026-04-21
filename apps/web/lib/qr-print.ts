/**
 * Utilities for QR code printing (§2.8).
 * The print logic is extracted into a pure function so it can be unit-tested
 * without a browser or React environment.
 */

export interface QrPrintOptions {
  /** The QR code value (qrCodeIdentifier). */
  identifier: string;
  /** Human-readable asset name shown below the QR code. */
  assetName: string;
}

/**
 * Builds the HTML document string used in the print window.
 * The result is a self-contained HTML page with a centred QR SVG
 * and the asset name below it.  The caller is responsible for
 * injecting the SVG markup because QR code generation is done in
 * the React component layer.
 */
export function buildQrPrintHtml(options: QrPrintOptions, svgMarkup: string): string {
  const { identifier, assetName } = options;
  const escaped = assetName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedId = identifier.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>QR Code — ${escaped}</title>
  <style>
    body {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: sans-serif;
      background: #fff;
    }
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .qr-container svg {
      width: 200px;
      height: 200px;
    }
    .asset-name {
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      max-width: 220px;
    }
    .asset-id {
      font-size: 11px;
      font-family: monospace;
      color: #6b7280;
      text-align: center;
    }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="qr-container">
    ${svgMarkup}
    <p class="asset-name">${escaped}</p>
    <p class="asset-id">${escapedId}</p>
  </div>
  <script>window.onload = function() { window.print(); window.close(); };<\/script>
</body>
</html>`;
}

/**
 * Opens a new browser window, writes the QR print document, and triggers
 * the browser's print dialog.  Returns immediately — the window handles
 * auto-close after printing.
 *
 * Not tested directly (requires a real browser); the HTML generation is
 * tested via buildQrPrintHtml.
 */
export function openQrPrintWindow(options: QrPrintOptions, svgMarkup: string): void {
  const win = window.open('', '_blank', 'width=400,height=500');
  if (!win) return;
  const html = buildQrPrintHtml(options, svgMarkup);
  win.document.open();
  win.document.write(html);
  win.document.close();
}
