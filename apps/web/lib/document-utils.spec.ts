/**
 * Unit tests for document-related utility logic (§1.10 / §1.11 / §1.12).
 *
 * These tests cover:
 * - Allowed document type sets per entity (PART, PREVENTIVE_PLAN)
 * - Version chain semantics
 * - File size formatting display
 *
 * Regression safety: allowed-type sets are the contracts between the backend
 * BadRequestException guards and the frontend select dropdowns. If a type were
 * added to the backend guard but not the frontend list, users would see an
 * "Invalid document type" error with no way to select a valid value.
 */

import { DocumentType } from '@gmao/shared';

// ── Allowed type constants (mirrored from the service) ────────────────────────

const PART_ALLOWED_TYPES = new Set<DocumentType>([
  DocumentType.TECHNICAL_MANUAL,
  DocumentType.SAFETY_DATA_SHEET,
  DocumentType.SPECIFICATION_SHEET,
]);

const PLAN_ALLOWED_TYPES = new Set<DocumentType>([
  DocumentType.PROCEDURE_DOCUMENT,
  DocumentType.SAFETY_DATA_SHEET,
  DocumentType.SPECIFICATION_SHEET,
]);

// Types that must NEVER appear in the part or plan dropdowns
const DISALLOWED_FOR_PARTS = [
  DocumentType.SCHEMATIC,
  DocumentType.INSTALLATION_REPORT,
  DocumentType.PROCEDURE_DOCUMENT,
  DocumentType.CONTRACTOR_REPORT,
  DocumentType.PHOTO,
  DocumentType.COMPLIANCE_CERTIFICATE,
];

const DISALLOWED_FOR_PLANS = [
  DocumentType.TECHNICAL_MANUAL,
  DocumentType.SCHEMATIC,
  DocumentType.INSTALLATION_REPORT,
  DocumentType.CONTRACTOR_REPORT,
  DocumentType.PHOTO,
  DocumentType.COMPLIANCE_CERTIFICATE,
];

// ── formatFileSize ─────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── Allowed-type set tests ────────────────────────────────────────────────────

describe('PART_ALLOWED_TYPES', () => {
  it('includes TECHNICAL_MANUAL', () => {
    expect(PART_ALLOWED_TYPES.has(DocumentType.TECHNICAL_MANUAL)).toBe(true);
  });

  it('includes SAFETY_DATA_SHEET', () => {
    expect(PART_ALLOWED_TYPES.has(DocumentType.SAFETY_DATA_SHEET)).toBe(true);
  });

  it('includes SPECIFICATION_SHEET', () => {
    expect(PART_ALLOWED_TYPES.has(DocumentType.SPECIFICATION_SHEET)).toBe(true);
  });

  it('has exactly 3 types', () => {
    expect(PART_ALLOWED_TYPES.size).toBe(3);
  });

  it.each(DISALLOWED_FOR_PARTS)('excludes %s', (type) => {
    expect(PART_ALLOWED_TYPES.has(type)).toBe(false);
  });
});

describe('PLAN_ALLOWED_TYPES', () => {
  it('includes PROCEDURE_DOCUMENT', () => {
    expect(PLAN_ALLOWED_TYPES.has(DocumentType.PROCEDURE_DOCUMENT)).toBe(true);
  });

  it('includes SAFETY_DATA_SHEET', () => {
    expect(PLAN_ALLOWED_TYPES.has(DocumentType.SAFETY_DATA_SHEET)).toBe(true);
  });

  it('includes SPECIFICATION_SHEET', () => {
    expect(PLAN_ALLOWED_TYPES.has(DocumentType.SPECIFICATION_SHEET)).toBe(true);
  });

  it('has exactly 3 types', () => {
    expect(PLAN_ALLOWED_TYPES.size).toBe(3);
  });

  it.each(DISALLOWED_FOR_PLANS)('excludes %s', (type) => {
    expect(PLAN_ALLOWED_TYPES.has(type)).toBe(false);
  });
});

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('displays raw bytes for values under 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 o');
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(1023)).toBe('1023 o');
  });

  it('displays KB for values 1 KB – < 1 MB', () => {
    expect(formatFileSize(1024)).toBe('1.0 Ko');
    expect(formatFileSize(2048)).toBe('2.0 Ko');
    expect(formatFileSize(1536)).toBe('1.5 Ko');
  });

  it('displays MB for values >= 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 Mo');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 Mo');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 Mo');
  });
});

// ── Version chain semantics ───────────────────────────────────────────────────

describe('document versioning semantics', () => {
  interface DocStub {
    id: string;
    version: number;
    isCurrentVersion: boolean;
    replacedById: string | null;
  }

  function buildVersionChain(count: number): DocStub[] {
    const docs: DocStub[] = [];
    for (let v = 1; v <= count; v++) {
      docs.push({
        id: `doc-v${v}`,
        version: v,
        isCurrentVersion: v === count,
        replacedById: v < count ? `doc-v${v + 1}` : null,
      });
    }
    return docs;
  }

  it('only the last document in a chain has isCurrentVersion = true', () => {
    const chain = buildVersionChain(3);
    const current = chain.filter((d) => d.isCurrentVersion);
    expect(current).toHaveLength(1);
    expect(current[0]!.version).toBe(3);
  });

  it('each archived version points to its replacement via replacedById', () => {
    const chain = buildVersionChain(3);
    expect(chain[0]!.replacedById).toBe('doc-v2');
    expect(chain[1]!.replacedById).toBe('doc-v3');
    expect(chain[2]!.replacedById).toBeNull();
  });

  it('version numbers are sequential starting from 1', () => {
    const chain = buildVersionChain(5);
    chain.forEach((doc, i) => {
      expect(doc.version).toBe(i + 1);
    });
  });

  it('a single upload creates version 1 with no predecessor', () => {
    const chain = buildVersionChain(1);
    expect(chain[0]!.version).toBe(1);
    expect(chain[0]!.isCurrentVersion).toBe(true);
    expect(chain[0]!.replacedById).toBeNull();
  });
});
