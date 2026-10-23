CREATE TABLE IF NOT EXISTS integration_api_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller TEXT NOT NULL,
  operation TEXT NOT NULL,
  target TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_api_audit_caller_created
  ON integration_api_audit (caller, created_at);
