const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

// GET /api/users/:id  — public profile
router.get('/:id', optionalAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.uuid, u.username, u.display_name, u.bio, u.avatar, u.website, u.twitter, u.github, u.role, u.created_at,
      (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS follower_count,
      (SELECT COUNT(*) FROM posts WHERE author_id = u.id AND status = 'published') AS post_count,
      (SELECT SUM(views) FROM posts WHERE author_id = u.id AND status = 'published') AS total_views,
      (SELECT COUNT(*) FROM comments WHERE user_id = u.id) AS total_comments
    FROM users u WHERE u.id = ? OR u.username = ?
  `).get(req.params.id, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let is_following = false;
  if (req.user) {
    const f = db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id);
    is_following = !!f;
  }
  res.json({ ...user, is_following, total_views: user.total_views || 0 });
});

// GET /api/users/:id/posts
router.get('/:id/posts', (req, res) => {
  const { offset, limit } = paginate(req);
  const user = db.prepare('SELECT id FROM users WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const posts = db.prepare(`
    SELECT p.id, p.uuid, p.title, p.slug, p.excerpt, p.featured_image, p.views, p.read_time, p.published_at,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p WHERE p.author_id = ? AND p.status = 'published'
    ORDER BY p.published_at DESC LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);

  const total = db.prepare("SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND status = 'published'").get(user.id).c;
  res.json({ posts, total, page: Math.floor(offset / limit) + 1, limit });
});

// PUT /api/users/profile
router.put('/profile', authenticate, async (req, res) => {
  const { display_name, bio, website, twitter, github, avatar, password, new_password } = req.body;

  if (new_password) {
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(password || '', user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const hash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(hash, req.user.id);
  }

  db.prepare(`
    UPDATE users SET display_name=?, bio=?, website=?, twitter=?, github=?, avatar=?, updated_at=strftime('%s','now')
    WHERE id=?
  `).run(display_name, bio, website, twitter, github, avatar, req.user.id);

  const updated = db.prepare('SELECT id, uuid, username, email, role, display_name, bio, avatar, website, twitter, github FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// POST /api/users/:id/follow
router.post('/:id/follow', authenticate, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  try {
    db.prepare('INSERT OR IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);
    // Notify
    db.prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, 'follow', ?, ?, ?)")
      .run(targetId, 'New follower', `${req.user.username} started following you`, `/profile/${req.user.username}`);
    res.json({ message: 'Followed' });
  } catch {
    res.status(400).json({ error: 'Already following' });
  }
});

// DELETE /api/users/:id/follow
router.delete('/:id/follow', authenticate, (req, res) => {
  db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?').run(req.user.id, parseInt(req.params.id));
  res.json({ message: 'Unfollowed' });
});

// GET /api/users/:id/followers
router.get('/:id/followers', (req, res) => {
  const { offset, limit } = paginate(req);
  const user = db.prepare('SELECT id FROM users WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const followers = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.role
    FROM followers f JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ? LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM followers WHERE following_id = ?').get(user.id).c;
  res.json({ followers, total });
});

// GET /api/users/:id/following
router.get('/:id/following', (req, res) => {
  const { offset, limit } = paginate(req);
  const user = db.prepare('SELECT id FROM users WHERE id = ? OR username = ?').get(req.params.id, req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const following = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.role
    FROM followers f JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ? LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);
  res.json({ following });
});

module.exports = router;
