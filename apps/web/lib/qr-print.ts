

export interface QrPrintOptions {

  identifier: string;

  assetName: string;
}

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

export function openQrPrintWindow(options: QrPrintOptions, svgMarkup: string): void {
  const win = window.open('', '_blank', 'width=400,height=500');
  if (!win) return;
  const html = buildQrPrintHtml(options, svgMarkup);
  win.document.open();
  win.document.write(html);
  win.document.close();
}
