-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAudit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- AdminAudit append-only enforcement (same rule as ActionLog)
CREATE OR REPLACE FUNCTION admin_audit_prevent_modify()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AdminAudit is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_prevent_modify ON "AdminAudit";
CREATE TRIGGER trg_admin_audit_prevent_modify
BEFORE UPDATE OR DELETE ON "AdminAudit"
FOR EACH ROW
EXECUTE FUNCTION admin_audit_prevent_modify();
