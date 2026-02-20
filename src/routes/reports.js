const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// POST /api/reports
router.post('/', authenticate, (req, res) => {
    const { target_type, target_id, reason } = req.body;
    if (!target_type || !target_id || !reason) return res.status(400).json({ error: 'target_type, target_id, and reason required' });
    db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)').run(req.user.id, target_type, target_id, reason);
    res.status(201).json({ message: 'Report submitted' });
});

// GET /api/reports (admin)
router.get('/', authenticate, (req, res) => {
    const reports = db.prepare(`
    SELECT r.*, u.username as reporter_username FROM reports r
    JOIN users u ON u.id = r.reporter_id ORDER BY r.created_at DESC LIMIT 50
  `).all();
    res.json(reports);
});

// PUT /api/reports/:id
router.put('/:id', authenticate, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Updated' });
});

module.exports = router;
