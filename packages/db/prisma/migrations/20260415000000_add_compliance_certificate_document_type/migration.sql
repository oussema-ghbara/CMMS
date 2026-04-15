-- Add COMPLIANCE_CERTIFICATE to the DocumentType enum.
-- This value is used internally to tag documents that are attached to
-- ComplianceCertificate records.  It must never be selected by users when
-- uploading regular asset documents.

ALTER TYPE "DocumentType" ADD VALUE 'COMPLIANCE_CERTIFICATE';
