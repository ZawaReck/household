CREATE TABLE IF NOT EXISTS sync_records (
  user_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  value_json TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (user_id, record_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_records_user_updated
  ON sync_records (user_id, updated_at);
