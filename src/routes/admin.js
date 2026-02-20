const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

// GET /api/admin/analytics
router.get('/analytics', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const stats = {
        users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
        posts: db.prepare('SELECT COUNT(*) as c FROM posts').get().c,
        published: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published'").get().c,
        pending: db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='pending'").get().c,
        comments: db.prepare('SELECT COUNT(*) as c FROM comments').get().c,
        views: db.prepare('SELECT COALESCE(SUM(views),0) as c FROM posts').get().c,
        report_count: db.prepare('SELECT COUNT(*) as c FROM reports').get().c,
        new_users_7d: db.prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= strftime('%s','now','-7 days')`).get().c,
        new_posts_7d: db.prepare(`SELECT COUNT(*) as c FROM posts WHERE created_at >= strftime('%s','now','-7 days')`).get().c,
    };
    const top_posts = db.prepare("SELECT id, title, slug, views, published_at FROM posts WHERE status='published' ORDER BY views DESC LIMIT 5").all();
    const recent_users = db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
    res.json(stats); // Return the stats object directly if DashboardOverview.jsx expects stats at the root
});

// GET /api/admin/users
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
    const { offset, limit } = paginate(req);
    const { search, role } = req.query;
    let where = '1=1'; let params = [];
    if (search) { where += ' AND (username LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (role) { where += ' AND role = ?'; params.push(role); }
    const users = db.prepare(`SELECT id, uuid, username, email, role, display_name, avatar, is_verified, is_suspended, created_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const { c: total } = db.prepare(`SELECT COUNT(*) as c FROM users WHERE ${where}`).get(...params);
    res.json({ users, total });
});

// PUT /api/admin/users/:id
router.put('/users/:id', authenticate, requireRole('admin'), (req, res) => {
    const { role, is_suspended } = req.body;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    if (is_suspended != null) db.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').run(is_suspended ? 1 : 0, user.id);
    res.json(db.prepare('SELECT id, username, email, role, is_suspended FROM users WHERE id = ?').get(user.id));
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authenticate, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted' });
});

// GET /api/admin/posts  (moderation queue)
router.get('/posts', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const { offset, limit } = paginate(req);
    const { status } = req.query;
    let where = status ? `p.status = '${status}'` : "1=1";
    const posts = db.prepare(`
    SELECT p.id, p.title, p.slug, p.status, p.rejection_note, p.created_at, p.updated_at,
           u.username as author_username, u.email as author_email
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
    const { c: total } = db.prepare(`SELECT COUNT(*) as c FROM posts p WHERE ${where}`).get();
    res.json({ posts, total });
});

// PUT /api/admin/posts/:id/approve
router.put('/posts/:id/approve', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE posts SET status='published', published_at=?, rejection_note=NULL, updated_at=strftime('%s','now') WHERE id=?").run(now, post.id);
    db.prepare("INSERT INTO post_status_log (post_id, changed_by, old_status, new_status) VALUES (?,?,?,?)").run(post.id, req.user.id, post.status, 'published');
    // Notify author
    db.prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, 'post_approved', 'Post Approved!', ?, ?)")
        .run(post.author_id, `Your post "${post.title}" has been approved and published.`, `/post/${post.slug}`);
    res.json({ message: 'Post approved and published' });
});

// PUT /api/admin/posts/:id/reject
router.put('/posts/:id/reject', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const { note } = req.body;
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    db.prepare("UPDATE posts SET status='rejected', rejection_note=?, updated_at=strftime('%s','now') WHERE id=?").run(note || null, post.id);
    db.prepare("INSERT INTO post_status_log (post_id, changed_by, old_status, new_status, note) VALUES (?,?,?,?,?)").run(post.id, req.user.id, post.status, 'rejected', note || null);
    db.prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, 'post_rejected', 'Post Rejected', ?, ?)")
        .run(post.author_id, `Your post "${post.title}" was rejected. ${note || ''}`, `/dashboard/posts`);
    res.json({ message: 'Post rejected' });
});

// DELETE /api/admin/posts/:id
router.delete('/posts/:id', authenticate, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Post deleted' });
});

// GET /api/admin/logs
router.get('/logs', authenticate, requireRole('admin'), (req, res) => {
    const { offset, limit } = paginate(req);
    const logs = db.prepare(`
    SELECT l.*, u.username FROM activity_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
    const { c: total } = db.prepare('SELECT COUNT(*) as c FROM activity_logs').get();
    res.json({ logs, total });
});

// GET/PUT /api/admin/seo
router.get('/seo', authenticate, requireRole('admin'), (req, res) => {
    res.json(db.prepare('SELECT * FROM seo_settings WHERE id = 1').get());
});
router.put('/seo', authenticate, requireRole('admin'), (req, res) => {
    const { site_name, site_tagline, meta_description, og_image, google_analytics, robots_txt } = req.body;
    db.prepare(`UPDATE seo_settings SET site_name=?,site_tagline=?,meta_description=?,og_image=?,google_analytics=?,robots_txt=?,updated_at=strftime('%s','now') WHERE id=1`)
        .run(site_name, site_tagline, meta_description, og_image, google_analytics, robots_txt);
    res.json(db.prepare('SELECT * FROM seo_settings WHERE id=1').get());
});

// GET /api/admin/ads
router.get('/ads', authenticate, requireRole('admin'), (req, res) => {
    res.json(db.prepare('SELECT * FROM ad_placements ORDER BY created_at DESC').all());
});
// POST /api/admin/ads
router.post('/ads', authenticate, requireRole('admin'), (req, res) => {
    const { name, position, code, is_active } = req.body;
    const r = db.prepare('INSERT INTO ad_placements (name, position, code, is_active) VALUES (?,?,?,?)').run(name, position, code, is_active ?? 1);
    res.status(201).json(db.prepare('SELECT * FROM ad_placements WHERE id=?').get(r.lastInsertRowid));
});
// PUT /api/admin/ads/:id
router.put('/ads/:id', authenticate, requireRole('admin'), (req, res) => {
    const { name, position, code, is_active } = req.body;
    db.prepare("UPDATE ad_placements SET name=?,position=?,code=?,is_active=?,updated_at=strftime('%s','now') WHERE id=?").run(name, position, code, is_active, req.params.id);
    res.json(db.prepare('SELECT * FROM ad_placements WHERE id=?').get(req.params.id));
});
// DELETE /api/admin/ads/:id
router.delete('/ads/:id', authenticate, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM ad_placements WHERE id=?').run(req.params.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;
