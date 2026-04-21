-- CreateTable
CREATE TABLE "ScheduledJobLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJobLog_jobName_key" ON "ScheduledJobLog"("jobName");

-- CreateIndex
CREATE INDEX "ScheduledJobLog_jobName_idx" ON "ScheduledJobLog"("jobName");
