-- ============================================================
-- Multi-Author Tech Blog - Full Database Schema
-- ============================================================
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  username    TEXT    NOT NULL UNIQUE,
  email       TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'subscriber' CHECK(role IN ('subscriber','author','editor','admin')),
  display_name TEXT,
  bio         TEXT,
  avatar      TEXT,
  website     TEXT,
  twitter     TEXT,
  github      TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_suspended INTEGER NOT NULL DEFAULT 0,
  two_fa_secret TEXT,
  two_fa_enabled INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  verify_token_exp INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  description TEXT,
  color       TEXT    DEFAULT '#6366f1',
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Media
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,
  original_name TEXT,
  mime_type   TEXT,
  size        INTEGER,
  url         TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  excerpt         TEXT,
  content         TEXT,
  featured_image  TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','rejected')),
  rejection_note  TEXT,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  is_sponsored    INTEGER NOT NULL DEFAULT 0,
  seo_title       TEXT,
  seo_description TEXT,
  views           INTEGER NOT NULL DEFAULT 0,
  read_time       INTEGER DEFAULT 1,
  published_at    INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Post Status Log
CREATE TABLE IF NOT EXISTS post_status_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  changed_by  INTEGER NOT NULL REFERENCES users(id),
  old_status  TEXT,
  new_status  TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Post ↔ Category (many-to-many)
CREATE TABLE IF NOT EXISTS post_categories (
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- Post ↔ Tag (many-to-many)
CREATE TABLE IF NOT EXISTS post_tags (
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  content     TEXT    NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Followers
CREATE TABLE IF NOT EXISTS followers (
  follower_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = broadcast
  type        TEXT    NOT NULL,  -- e.g. 'follow', 'comment', 'post_approved', 'broadcast'
  title       TEXT    NOT NULL,
  message     TEXT,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT    NOT NULL CHECK(target_type IN ('post','comment','user')),
  target_id   INTEGER NOT NULL,
  reason      TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- SEO Settings
CREATE TABLE IF NOT EXISTS seo_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  site_name       TEXT    DEFAULT 'TechBlog',
  site_tagline    TEXT    DEFAULT 'Your source for tech news',
  meta_description TEXT,
  og_image        TEXT,
  google_analytics TEXT,
  robots_txt      TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Ad Placements
CREATE TABLE IF NOT EXISTS ad_placements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  position    TEXT    NOT NULL,  -- e.g. 'header', 'sidebar', 'after_post'
  code        TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Newsletter Subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  token       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, post_id)
);

-- Post Likes
CREATE TABLE IF NOT EXISTS post_likes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, post_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_status      ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_author      ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_published   ON posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_slug        ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_comments_post     ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_followers_f       ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_ing     ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_usr ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_usr      ON activity_logs(user_id);

-- Default SEO row
INSERT OR IGNORE INTO seo_settings (id) VALUES (1);
