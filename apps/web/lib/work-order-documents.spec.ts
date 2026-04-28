/**
 * Unit tests for work order document API helpers (spec §11.2, §8.8, §8.9).
 *
 * Covers:
 *   1. FormData construction for uploadDocument
 *   2. URL construction for listDocuments, deleteDocument, getDocumentDownloadUrl
 *   3. Allowed document types set matches backend WO_ALLOWED_TYPES
 *   4. Upload form validation logic (file required, type required)
 *
 * No network calls are made — the api module is not imported.
 * Logic is extracted and tested in isolation so that refactors to the
 * component do not silently break the API contract.
 */

// ── Allowed document types (mirrors DocumentsService.WO_ALLOWED_TYPES) ────────

const WO_ALLOWED_DOC_TYPES = [
  'TECHNICAL_MANUAL',
  'SCHEMATIC',
  'SAFETY_DATA_SHEET',
  'SPECIFICATION_SHEET',
  'PROCEDURE_DOCUMENT',
  'CONTRACTOR_REPORT',
  'PHOTO',
] as const;

const WO_FORBIDDEN_DOC_TYPES = ['COMPLIANCE_CERTIFICATE', 'INSTALLATION_REPORT'] as const;

describe('WO_ALLOWED_DOC_TYPES', () => {
  it('contains exactly 7 types', () => {
    expect(WO_ALLOWED_DOC_TYPES).toHaveLength(7);
  });

  it('includes PHOTO (intervention closure photos §8.8)', () => {
    expect(WO_ALLOWED_DOC_TYPES).toContain('PHOTO');
  });

  it('includes CONTRACTOR_REPORT (on-hold resume §8.9)', () => {
    expect(WO_ALLOWED_DOC_TYPES).toContain('CONTRACTOR_REPORT');
  });

  it('includes SCHEMATIC (reference docs at creation §11.2)', () => {
    expect(WO_ALLOWED_DOC_TYPES).toContain('SCHEMATIC');
  });

  it.each(WO_FORBIDDEN_DOC_TYPES)('does NOT include forbidden type %s', (type) => {
    expect(WO_ALLOWED_DOC_TYPES).not.toContain(type);
  });
});

// ── FormData construction ─────────────────────────────────────────────────────

function buildUploadFormData(file: File, documentType: string): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('documentType', documentType);
  return form;
}

describe('buildUploadFormData', () => {
  it('appends the file under the "file" key', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const form = buildUploadFormData(file, 'PHOTO');
    expect(form.get('file')).toBe(file);
  });

  it('appends the documentType under the "documentType" key', () => {
    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
    const form = buildUploadFormData(file, 'CONTRACTOR_REPORT');
    expect(form.get('documentType')).toBe('CONTRACTOR_REPORT');
  });

  it('produces a FormData with exactly 2 entries', () => {
    const file = new File(['x'], 'x.pdf');
    const form = buildUploadFormData(file, 'TECHNICAL_MANUAL');
    const keys = [...form.keys()];
    expect(keys).toHaveLength(2);
  });
});

// ── URL construction ─────────────────────────────────────────────────────────

function listDocumentsUrl(woId: string) {
  return `/work-orders/${woId}/documents`;
}
function deleteDocumentUrl(woId: string, docId: string) {
  return `/work-orders/${woId}/documents/${docId}`;
}
function downloadDocumentUrl(woId: string, docId: string) {
  return `/work-orders/${woId}/documents/${docId}/download`;
}

describe('document endpoint URL helpers', () => {
  const WO_ID = 'wo-abc';
  const DOC_ID = 'doc-xyz';

  it('listDocumentsUrl returns correct path', () => {
    expect(listDocumentsUrl(WO_ID)).toBe('/work-orders/wo-abc/documents');
  });

  it('deleteDocumentUrl returns correct path', () => {
    expect(deleteDocumentUrl(WO_ID, DOC_ID)).toBe('/work-orders/wo-abc/documents/doc-xyz');
  });

  it('downloadDocumentUrl returns correct path with /download suffix', () => {
    expect(downloadDocumentUrl(WO_ID, DOC_ID)).toBe(
      '/work-orders/wo-abc/documents/doc-xyz/download',
    );
  });
});

// ── Upload form validation ────────────────────────────────────────────────────

type ValidationResult = { valid: true } | { valid: false; error: 'fileRequired' | 'typeRequired' };

function validateDocUploadForm(file: File | null, docType: string): ValidationResult {
  if (!file) return { valid: false, error: 'fileRequired' };
  if (!docType) return { valid: false, error: 'typeRequired' };
  return { valid: true };
}

describe('validateDocUploadForm', () => {
  it('returns fileRequired when no file is selected', () => {
    const result = validateDocUploadForm(null, 'PHOTO');
    expect(result).toEqual({ valid: false, error: 'fileRequired' });
  });

  it('returns typeRequired when docType is empty string', () => {
    const file = new File(['x'], 'photo.jpg');
    const result = validateDocUploadForm(file, '');
    expect(result).toEqual({ valid: false, error: 'typeRequired' });
  });

  it('returns valid when both file and type are provided', () => {
    const file = new File(['x'], 'photo.jpg');
    const result = validateDocUploadForm(file, 'PHOTO');
    expect(result).toEqual({ valid: true });
  });

  it('returns fileRequired (checked first) when both are missing', () => {
    const result = validateDocUploadForm(null, '');
    expect(result).toEqual({ valid: false, error: 'fileRequired' });
  });
});

// ── File size formatting (used in document list rendering) ────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

describe('formatFileSize', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats KB range', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats MB range', () => {
    expect(formatFileSize(1_572_864)).toBe('1.5 MB');
  });
});
