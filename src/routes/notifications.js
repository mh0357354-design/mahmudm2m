const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authenticate, (req, res) => {
    const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? OR user_id IS NULL
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
    const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0').get(req.user.id).c;
    res.json({ notifications, unread });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL').run(req.user.id);
    res.json({ message: 'All marked as read' });
});

// POST /api/notifications/broadcast (admin only)
router.post('/broadcast', authenticate, requireRole('admin'), (req, res) => {
    const { title, message, link } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    db.prepare("INSERT INTO notifications (user_id, type, title, message, link) VALUES (NULL, 'broadcast', ?, ?, ?)")
        .run(title, message, link || null);
    res.status(201).json({ message: 'Broadcast sent' });
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, (req, res) => {
    db.prepare('DELETE FROM notifications WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(req.params.id, req.user.id);
    res.json({ message: 'Notification deleted' });
});

module.exports = router;
