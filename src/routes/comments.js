const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');

// GET /api/comments?post_id=X
router.get('/', optionalAuth, (req, res) => {
    const { post_id } = req.query;
    if (!post_id) return res.status(400).json({ error: 'post_id is required' });
    const { offset, limit } = paginate(req);

    const comments = db.prepare(`
    SELECT c.id, c.content, c.parent_id, c.created_at,
           u.id as user_id, u.username, u.display_name, u.avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? AND c.is_approved = 1
    ORDER BY c.created_at ASC LIMIT ? OFFSET ?
  `).all(post_id, limit, offset);

    const total = db.prepare('SELECT COUNT(*) as c FROM comments WHERE post_id = ? AND is_approved = 1').get(post_id).c;
    res.json({ comments, total });
});

// POST /api/comments
router.post('/', authenticate, (req, res) => {
    const { post_id, content, parent_id } = req.body;
    if (!post_id || !content?.trim()) return res.status(400).json({ error: 'post_id and content required' });

    const post = db.prepare("SELECT id, author_id FROM posts WHERE id = ? AND status = 'published'").get(post_id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const r = db.prepare('INSERT INTO comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)').run(post_id, req.user.id, parent_id || null, content.trim());

    // Notify post author
    if (post.author_id !== req.user.id) {
        db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'comment', 'New comment on your post', ?)")
            .run(post.author_id, `${req.user.username} commented on your post`);
    }

    const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(r.lastInsertRowid);
    res.status(201).json(comment);
});

// DELETE /api/comments/:id
router.delete('/:id', authenticate, (req, res) => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (c.user_id !== req.user.id && !['editor', 'admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    res.json({ message: 'Comment deleted' });
});

module.exports = router;
