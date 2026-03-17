-- Mnemo SQLite Schema

-- Core notes table
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  body        TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  created_at  TEXT NOT NULL,                -- ISO 8601
  updated_at  TEXT NOT NULL                 -- ISO 8601
);

-- Links between notes (directed: source → target)
CREATE TABLE IF NOT EXISTS note_links (
  source_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, target_id)
);

-- Vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS embeddings (
  note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  model       TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  vector      BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (note_id, model)
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  body,
  tags,
  content='notes',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id);
