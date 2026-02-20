const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { toSlug } = require('../utils/helpers');

// GET /api/tags
router.get('/', (req, res) => {
    const { search } = req.query;
    let sql = `SELECT t.*, (SELECT COUNT(*) FROM post_tags pt JOIN posts p ON p.id=pt.post_id WHERE pt.tag_id=t.id AND p.status='published') as post_count FROM tags t`;
    let params = [];
    if (search) { sql += ' WHERE t.name LIKE ?'; params.push(`%${search}%`); }
    sql += ' ORDER BY post_count DESC LIMIT 100';
    res.json(db.prepare(sql).all(...params));
});

// POST /api/tags (admin/editor)
router.post('/', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = toSlug(name);
    try {
        const r = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(name, slug);
        res.status(201).json(db.prepare('SELECT * FROM tags WHERE id = ?').get(r.lastInsertRowid));
    } catch { res.status(409).json({ error: 'Tag already exists' }); }
});

// DELETE /api/tags/:id
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;
