-- Add soft-archive fields to ComplianceCertificate
-- Hard deletes are prohibited on regulated entities; use isArchived instead.
ALTER TABLE "ComplianceCertificate"
  ADD COLUMN "isArchived"   BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN "archivedAt"   TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

ALTER TABLE "ComplianceCertificate"
  ADD CONSTRAINT "ComplianceCertificate_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ComplianceCertificate_isArchived_idx" ON "ComplianceCertificate"("isArchived");
