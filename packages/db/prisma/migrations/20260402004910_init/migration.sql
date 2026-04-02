-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REQUESTER', 'TECHNICIAN', 'SUPERVISOR', 'STOREKEEPER');

-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('CRITICAL', 'STANDARD', 'NON_CRITICAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'IN_MAINTENANCE', 'MAINTENANCE_BLOCKED', 'OUT_OF_SERVICE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_VALIDATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderSource" AS ENUM ('PROBLEM_REPORT', 'DIRECT_CREATION', 'PREVENTIVE_PLAN');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('PRINCIPAL', 'CONTRIBUTOR');

-- CreateEnum
CREATE TYPE "InterventionActionType" AS ENUM ('INSPECTION', 'REPAIR', 'REPLACEMENT', 'CALIBRATION', 'LUBRICATION', 'CLEANING');

-- CreateEnum
CREATE TYPE "InterventionResult" AS ENUM ('RESOLVED', 'PARTIALLY_RESOLVED', 'NEEDS_FOLLOW_UP', 'COULD_NOT_INTERVENE');

-- CreateEnum
CREATE TYPE "OnHoldReasonType" AS ENUM ('MISSING_PART', 'EXTERNAL_CONTRACTOR', 'ACCESS_DENIED', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'DONE', 'ANOMALY_DETECTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ChecklistTaskType" AS ENUM ('INSPECTION', 'MEASUREMENT', 'LUBRICATION', 'CLEANING', 'REPLACEMENT', 'CALIBRATION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "UrgencyPerception" AS ENUM ('MACHINE_STOPPED', 'ABNORMAL_BEHAVIOR', 'MINOR_ISSUE');

-- CreateEnum
CREATE TYPE "ProblemReportStatus" AS ENUM ('PENDING', 'CONVERTED', 'REJECTED', 'DEFERRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportRejectionReason" AS ENUM ('INVALID_REPORT', 'UNSUPPORTED_EQUIPMENT', 'ALREADY_ADDRESSED', 'DUPLICATE_EXISTING_WO', 'OUT_OF_MAINTENANCE_SCOPE');

-- CreateEnum
CREATE TYPE "ReportArchiveReason" AS ENUM ('RESOLVED_SPONTANEOUSLY', 'EQUIPMENT_DECOMMISSIONED', 'SUBMITTED_IN_ERROR', 'REPLACED_BY_OTHER_WO', 'MANAGEMENT_DECISION');

-- CreateEnum
CREATE TYPE "PartUnit" AS ENUM ('PIECE', 'LITER', 'KG', 'METER', 'OTHER');

-- CreateEnum
CREATE TYPE "PartRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'PARTIALLY_FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartRequestRejectionReason" AS ENUM ('OUT_OF_STOCK', 'NOT_APPLICABLE', 'INCORRECT_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INCOMING', 'OUTGOING', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('PHYSICAL_DAMAGE', 'COUNTING_ERROR', 'LOSS_OR_THEFT', 'SUPPLIER_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('PRESSURE_VESSEL', 'ELECTRICAL_INSTALLATION', 'LIFTING_EQUIPMENT', 'FIRE_SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('ASSET', 'PART', 'PREVENTIVE_PLAN', 'WORK_ORDER', 'INTERVENTION');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TECHNICAL_MANUAL', 'SCHEMATIC', 'INSTALLATION_REPORT', 'SAFETY_DATA_SHEET', 'SPECIFICATION_SHEET', 'PROCEDURE_DOCUMENT', 'CONTRACTOR_REPORT', 'PHOTO');

-- CreateEnum
CREATE TYPE "PreventiveFrequencyType" AS ENUM ('FIXED_INTERVAL_DAYS', 'CALENDAR');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REPORT_CONFIRMED', 'REPORT_CONVERTED_TO_WO', 'REPORT_REJECTED', 'REPORT_ARCHIVED', 'LINKED_WO_CLOSED', 'WO_ASSIGNED', 'WO_REASSIGNED_FROM', 'WO_REASSIGNED_TO', 'PROMOTED_TO_PRINCIPAL', 'PART_REQUEST_FULFILLED', 'PART_REQUEST_REJECTED', 'CLOSURE_REJECTED', 'DUE_DATE_APPROACHING', 'WO_RESUMED', 'CONTRIBUTOR_BLOCK_RECEIVED', 'SYNC_CONFLICT', 'WO_CANCELLED_NOTIFY', 'ASSET_DECOMMISSIONED_NOTIFY', 'NEW_PROBLEM_REPORT', 'REQUESTER_COMMENT_ADDED', 'WO_ON_HOLD', 'WO_PENDING_VALIDATION', 'WO_OVERDUE', 'WO_AUTO_ESCALATED', 'DEFERRED_REPORT_REMINDER', 'CONTRACTOR_DATE_OVERDUE', 'ACCESS_RETRY_APPROACHING', 'VALIDATION_REMINDER_24H', 'PREVENTIVE_PLAN_GENERATED', 'CERTIFICATE_EXPIRING', 'UNASSIGNED_PLAN_WO', 'FOLLOW_UP_PROMPT', 'DAILY_SUMMARY', 'NEW_PART_REQUEST', 'STOCK_BELOW_MINIMUM', 'PENDING_REQUEST_CANCELLED', 'PART_RETURN_PROMPT', 'SCHEDULED_JOB_FAILED', 'NOTIFICATION_DELIVERY_FAILED');

-- CreateEnum
CREATE TYPE "WOCancellationReason" AS ENUM ('DUPLICATE', 'EQUIPMENT_DECOMMISSIONED', 'RESOLVED_OTHERWISE', 'CREATED_IN_ERROR', 'EXTERNAL_DECISION');

-- CreateEnum
CREATE TYPE "WOReassignmentReason" AS ENUM ('TECHNICIAN_OVERLOADED', 'TECHNICIAN_ABSENT', 'SPECIFIC_SKILL_REQUIRED', 'PRIORITY_CONFLICT', 'OTHER');

-- CreateEnum
CREATE TYPE "ValidationRejectionReason" AS ENUM ('INSUFFICIENT_DESCRIPTION', 'PARTS_USED_MISMATCH', 'INCONSISTENT_TIME', 'INCOMPLETE_CHECKLIST', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "hourlyRate" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "valueBefore" JSONB,
    "valueAfter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "level" INTEGER NOT NULL,
    "fullPath" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" "ChecklistTaskType" NOT NULL,
    "expectedCondition" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "autoCreateCorrectiveWO" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "installationDate" TIMESTAMP(3),
    "warrantyExpiration" TIMESTAMP(3),
    "qrCodeIdentifier" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "parentId" TEXT,
    "criticality" "AssetCriticality" NOT NULL DEFAULT 'STANDARD',
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetStatusLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromStatus" "AssetStatus" NOT NULL,
    "toStatus" "AssetStatus" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCertificate" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "certificateType" "CertificateType" NOT NULL,
    "otherType" TEXT,
    "issuingAuthority" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'VALID',
    "documentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "type" "WorkOrderType" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "WorkOrderPriority" NOT NULL,
    "sourceType" "WorkOrderSource" NOT NULL,
    "description" TEXT NOT NULL,
    "internalNotes" TEXT,
    "capturedLocationPath" TEXT NOT NULL,
    "estimatedDurationMinutes" INTEGER,
    "dueDate" TIMESTAMP(3),
    "sourceReportId" TEXT,
    "sourcePlanId" TEXT,
    "followUpFromId" TEXT,
    "triggeredByChecklistItemId" TEXT,
    "assetId" TEXT NOT NULL,
    "principalTechnicianId" TEXT,
    "contractorCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "contractorCostCaptured" BOOLEAN NOT NULL DEFAULT true,
    "simultaneousMaintenanceAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "simultaneousMaintenanceReason" TEXT,
    "cancellationReason" "WOCancellationReason",
    "cancellationDetail" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "postCancellationAssetStatus" "AssetStatus",
    "createdById" TEXT NOT NULL,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStatusLog" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatus" "WorkOrderStatus",
    "toStatus" "WorkOrderStatus" NOT NULL,
    "actorId" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderPriorityLog" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromPriority" "WorkOrderPriority" NOT NULL,
    "toPriority" "WorkOrderPriority" NOT NULL,
    "actorId" TEXT,
    "isAutoEscalation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderPriorityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderAssignment" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorBlockFlag" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "reasonType" "OnHoldReasonType" NOT NULL,
    "detail" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ContributorBlockFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderValidation" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rejectionReason" "ValidationRejectionReason",
    "rejectionDetail" TEXT,
    "validatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderReassignment" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromTechnicianId" TEXT NOT NULL,
    "toTechnicianId" TEXT NOT NULL,
    "reason" "WOReassignmentReason" NOT NULL,
    "reasonDetail" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderReassignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionLog" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "activeDurationMinutes" INTEGER,
    "hourlyRateAtTime" DECIMAL(10,2),
    "result" "InterventionResult",
    "resultExplanation" TEXT,
    "isReassignmentRemnant" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterventionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionAction" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "actionType" "InterventionActionType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffListPartUsage" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffListPartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnHoldPeriod" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "reasonType" "OnHoldReasonType" NOT NULL,
    "detail" TEXT,
    "linkedPartRequestId" TEXT,
    "expectedResolutionDate" TIMESTAMP(3),
    "retryDate" TIMESTAMP(3),
    "supervisorAssetStatusChoice" "AssetStatus",
    "supervisorResolutionNote" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnHoldPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventivePlan" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequencyType" "PreventiveFrequencyType" NOT NULL,
    "intervalDays" INTEGER,
    "calendarExpression" TEXT,
    "estimatedDurationMinutes" INTEGER,
    "defaultTechnicianId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventivePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventivePlanChecklistItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" "ChecklistTaskType" NOT NULL,
    "expectedCondition" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "autoCreateCorrectiveWO" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreventivePlanChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderChecklistItem" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sourcePlanItemId" TEXT,
    "description" TEXT NOT NULL,
    "taskType" "ChecklistTaskType" NOT NULL,
    "expectedCondition" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "autoCreateCorrectiveWO" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "anomalyDescription" TEXT,
    "notApplicableReason" TEXT,
    "isLockedByHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "description" TEXT,
    "unit" "PartUnit" NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minimumStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "warehouseLocation" TEXT,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartRequest" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "partId" TEXT,
    "offCatalogDescription" TEXT,
    "quantityRequested" INTEGER NOT NULL,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" "PartRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" "PartRequestRejectionReason",
    "rejectionDetail" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isPositiveAdjustment" BOOLEAN,
    "unitCostAtTime" DECIMAL(12,2),
    "workOrderId" TEXT,
    "partRequestId" TEXT,
    "supplierReference" TEXT,
    "receivedDate" TIMESTAMP(3),
    "adjustmentReason" "StockAdjustmentReason",
    "adjustmentDetail" TEXT,
    "note" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urgencyPerception" "UrgencyPerception" NOT NULL,
    "status" "ProblemReportStatus" NOT NULL DEFAULT 'PENDING',
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "rejectionReason" "ReportRejectionReason",
    "rejectionDetail" TEXT,
    "deferredAt" TIMESTAMP(3),
    "deferNote" TEXT,
    "archiveReason" "ReportArchiveReason",
    "replacedByWorkOrderRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReportComment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "acknowledgedBySupervisor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReportComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
    "replacedById" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "emailFailed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "Location_level_idx" ON "Location"("level");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_categoryId_sortOrder_idx" ON "ChecklistTemplateItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_qrCodeIdentifier_key" ON "Asset"("qrCodeIdentifier");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_criticality_idx" ON "Asset"("criticality");

-- CreateIndex
CREATE INDEX "Asset_qrCodeIdentifier_idx" ON "Asset"("qrCodeIdentifier");

-- CreateIndex
CREATE INDEX "Asset_parentId_idx" ON "Asset"("parentId");

-- CreateIndex
CREATE INDEX "AssetStatusLog_assetId_createdAt_idx" ON "AssetStatusLog"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetStatusLog_workOrderId_idx" ON "AssetStatusLog"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCertificate_documentId_key" ON "ComplianceCertificate"("documentId");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_assetId_idx" ON "ComplianceCertificate"("assetId");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_expirationDate_idx" ON "ComplianceCertificate"("expirationDate");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_status_idx" ON "ComplianceCertificate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_referenceNumber_key" ON "WorkOrder"("referenceNumber");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");

-- CreateIndex
CREATE INDEX "WorkOrder_priority_idx" ON "WorkOrder"("priority");

-- CreateIndex
CREATE INDEX "WorkOrder_assetId_idx" ON "WorkOrder"("assetId");

-- CreateIndex
CREATE INDEX "WorkOrder_sourceType_idx" ON "WorkOrder"("sourceType");

-- CreateIndex
CREATE INDEX "WorkOrder_dueDate_idx" ON "WorkOrder"("dueDate");

-- CreateIndex
CREATE INDEX "WorkOrder_createdAt_idx" ON "WorkOrder"("createdAt");

-- CreateIndex
CREATE INDEX "WorkOrder_type_status_idx" ON "WorkOrder"("type", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_assetId_type_status_idx" ON "WorkOrder"("assetId", "type", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_principalTechnicianId_status_idx" ON "WorkOrder"("principalTechnicianId", "status");

-- CreateIndex
CREATE INDEX "WorkOrderStatusLog_workOrderId_createdAt_idx" ON "WorkOrderStatusLog"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderPriorityLog_workOrderId_createdAt_idx" ON "WorkOrderPriorityLog"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderAssignment_workOrderId_isActive_idx" ON "WorkOrderAssignment"("workOrderId", "isActive");

-- CreateIndex
CREATE INDEX "WorkOrderAssignment_technicianId_isActive_idx" ON "WorkOrderAssignment"("technicianId", "isActive");

-- CreateIndex
CREATE INDEX "WorkOrderAssignment_workOrderId_role_isActive_idx" ON "WorkOrderAssignment"("workOrderId", "role", "isActive");

-- CreateIndex
CREATE INDEX "ContributorBlockFlag_assignmentId_idx" ON "ContributorBlockFlag"("assignmentId");

-- CreateIndex
CREATE INDEX "WorkOrderValidation_workOrderId_createdAt_idx" ON "WorkOrderValidation"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderReassignment_workOrderId_idx" ON "WorkOrderReassignment"("workOrderId");

-- CreateIndex
CREATE INDEX "InterventionLog_workOrderId_technicianId_idx" ON "InterventionLog"("workOrderId", "technicianId");

-- CreateIndex
CREATE INDEX "InterventionLog_workOrderId_createdAt_idx" ON "InterventionLog"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "InterventionAction_interventionId_idx" ON "InterventionAction"("interventionId");

-- CreateIndex
CREATE INDEX "OffListPartUsage_interventionId_idx" ON "OffListPartUsage"("interventionId");

-- CreateIndex
CREATE INDEX "OnHoldPeriod_workOrderId_idx" ON "OnHoldPeriod"("workOrderId");

-- CreateIndex
CREATE INDEX "OnHoldPeriod_reasonType_idx" ON "OnHoldPeriod"("reasonType");

-- CreateIndex
CREATE INDEX "PreventivePlan_assetId_idx" ON "PreventivePlan"("assetId");

-- CreateIndex
CREATE INDEX "PreventivePlan_isActive_nextDueAt_idx" ON "PreventivePlan"("isActive", "nextDueAt");

-- CreateIndex
CREATE INDEX "PreventivePlanChecklistItem_planId_sortOrder_idx" ON "PreventivePlanChecklistItem"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkOrderChecklistItem_workOrderId_sortOrder_idx" ON "WorkOrderChecklistItem"("workOrderId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Part_referenceCode_key" ON "Part"("referenceCode");

-- CreateIndex
CREATE INDEX "Part_referenceCode_idx" ON "Part"("referenceCode");

-- CreateIndex
CREATE INDEX "Part_isActive_idx" ON "Part"("isActive");

-- CreateIndex
CREATE INDEX "Part_currentStock_idx" ON "Part"("currentStock");

-- CreateIndex
CREATE INDEX "PartRequest_workOrderId_idx" ON "PartRequest"("workOrderId");

-- CreateIndex
CREATE INDEX "PartRequest_status_idx" ON "PartRequest"("status");

-- CreateIndex
CREATE INDEX "PartRequest_partId_idx" ON "PartRequest"("partId");

-- CreateIndex
CREATE INDEX "PartRequest_requesterId_idx" ON "PartRequest"("requesterId");

-- CreateIndex
CREATE INDEX "StockMovement_partId_createdAt_idx" ON "StockMovement"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_workOrderId_idx" ON "StockMovement"("workOrderId");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_partId_type_idx" ON "StockMovement"("partId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemReport_referenceNumber_key" ON "ProblemReport"("referenceNumber");

-- CreateIndex
CREATE INDEX "ProblemReport_status_idx" ON "ProblemReport"("status");

-- CreateIndex
CREATE INDEX "ProblemReport_assetId_idx" ON "ProblemReport"("assetId");

-- CreateIndex
CREATE INDEX "ProblemReport_reporterId_idx" ON "ProblemReport"("reporterId");

-- CreateIndex
CREATE INDEX "ProblemReport_createdAt_idx" ON "ProblemReport"("createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_status_deferredAt_idx" ON "ProblemReport"("status", "deferredAt");

-- CreateIndex
CREATE INDEX "ProblemReportComment_reportId_createdAt_idx" ON "ProblemReportComment"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_idx" ON "Document"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Document_entityType_entityId_isCurrentVersion_idx" ON "Document"("entityType", "entityId", "isCurrentVersion");

-- CreateIndex
CREATE INDEX "Notification_recipientId_isRead_createdAt_idx" ON "Notification"("recipientId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_emailFailed_idx" ON "Notification"("emailFailed");

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusLog" ADD CONSTRAINT "AssetStatusLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusLog" ADD CONSTRAINT "AssetStatusLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetStatusLog" ADD CONSTRAINT "AssetStatusLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCertificate" ADD CONSTRAINT "ComplianceCertificate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCertificate" ADD CONSTRAINT "ComplianceCertificate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCertificate" ADD CONSTRAINT "ComplianceCertificate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "ProblemReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "PreventivePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_followUpFromId_fkey" FOREIGN KEY ("followUpFromId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_triggeredByChecklistItemId_fkey" FOREIGN KEY ("triggeredByChecklistItemId") REFERENCES "WorkOrderChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_principalTechnicianId_fkey" FOREIGN KEY ("principalTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusLog" ADD CONSTRAINT "WorkOrderStatusLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusLog" ADD CONSTRAINT "WorkOrderStatusLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPriorityLog" ADD CONSTRAINT "WorkOrderPriorityLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderPriorityLog" ADD CONSTRAINT "WorkOrderPriorityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAssignment" ADD CONSTRAINT "WorkOrderAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorBlockFlag" ADD CONSTRAINT "ContributorBlockFlag_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkOrderAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderValidation" ADD CONSTRAINT "WorkOrderValidation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderValidation" ADD CONSTRAINT "WorkOrderValidation_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderReassignment" ADD CONSTRAINT "WorkOrderReassignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderReassignment" ADD CONSTRAINT "WorkOrderReassignment_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionLog" ADD CONSTRAINT "InterventionLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionLog" ADD CONSTRAINT "InterventionLog_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionAction" ADD CONSTRAINT "InterventionAction_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "InterventionLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffListPartUsage" ADD CONSTRAINT "OffListPartUsage_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "InterventionLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnHoldPeriod" ADD CONSTRAINT "OnHoldPeriod_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnHoldPeriod" ADD CONSTRAINT "OnHoldPeriod_linkedPartRequestId_fkey" FOREIGN KEY ("linkedPartRequestId") REFERENCES "PartRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventivePlan" ADD CONSTRAINT "PreventivePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventivePlan" ADD CONSTRAINT "PreventivePlan_defaultTechnicianId_fkey" FOREIGN KEY ("defaultTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventivePlanChecklistItem" ADD CONSTRAINT "PreventivePlanChecklistItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PreventivePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_sourcePlanItemId_fkey" FOREIGN KEY ("sourcePlanItemId") REFERENCES "PreventivePlanChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderChecklistItem" ADD CONSTRAINT "WorkOrderChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES "PartRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportComment" ADD CONSTRAINT "ProblemReportComment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportComment" ADD CONSTRAINT "ProblemReportComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
