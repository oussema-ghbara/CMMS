-- AddColumn reportPdfKey to WorkOrder for tracking generated PDF reports
ALTER TABLE "WorkOrder" ADD COLUMN "reportPdfKey" TEXT;
