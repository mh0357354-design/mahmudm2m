const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/bookmarks
router.get('/', authenticate, (req, res) => {
    const bookmarks = db.prepare(`
    SELECT p.id, p.title, p.slug, p.excerpt, p.featured_image, p.read_time, p.published_at,
           u.username as author_username, u.display_name as author_name, u.avatar as author_avatar
    FROM bookmarks b
    JOIN posts p ON p.id = b.post_id
    JOIN users u ON u.id = p.author_id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
    res.json(bookmarks);
});

// POST /api/bookmarks
router.post('/', authenticate, (req, res) => {
    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });
    try {
        db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)').run(req.user.id, post_id);
        res.status(201).json({ message: 'Bookmarked' });
    } catch { res.status(400).json({ error: 'Already bookmarked' }); }
});

// DELETE /api/bookmarks/:post_id
router.delete('/:post_id', authenticate, (req, res) => {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.post_id);
    res.json({ message: 'Bookmark removed' });
});

module.exports = router;
