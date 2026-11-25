-- CreateTable Corporation
CREATE TABLE IF NOT EXISTS "Corporation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "officialId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "nameKn" TEXT,

    CONSTRAINT "Corporation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Corporation_code_key" ON "Corporation"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Corporation_officialId_key" ON "Corporation"("officialId");

-- AlterTable Ward
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "officialId" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "wardNumber" INTEGER;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "nameKn" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "corporationId" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "zoneCode" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "zoneName" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "assemblyName" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "isLegacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "isOperationalArea" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "geometrySource" TEXT;
ALTER TABLE "Ward" ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Ward_officialId_key" ON "Ward"("officialId");
CREATE INDEX IF NOT EXISTS "Ward_corporationId_idx" ON "Ward"("corporationId");
CREATE INDEX IF NOT EXISTS "Ward_wardNumber_idx" ON "Ward"("wardNumber");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Ward_corporationId_fkey'
    ) THEN
        ALTER TABLE "Ward" ADD CONSTRAINT "Ward_corporationId_fkey"
        FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable Issue (preserve legacy ward reference for auditability)
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "legacyWardId" TEXT;
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "wardMappingStatus" TEXT;
