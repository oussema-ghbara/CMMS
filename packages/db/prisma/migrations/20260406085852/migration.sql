/*
  Warnings:

  - A unique constraint covering the columns `[replacedById]` on the table `Document` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Document_replacedById_key" ON "Document"("replacedById");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
