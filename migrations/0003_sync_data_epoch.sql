CREATE TABLE IF NOT EXISTS sync_epochs (
  user_id TEXT PRIMARY KEY,
  data_epoch TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE sync_records ADD COLUMN data_epoch TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_sync_records_user_epoch_updated
  ON sync_records (user_id, data_epoch, updated_at);
