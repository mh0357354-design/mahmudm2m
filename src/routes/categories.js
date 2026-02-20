const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { toSlug } = require('../utils/helpers');

// GET /api/categories
router.get('/', (req, res) => {
    const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM post_categories pc JOIN posts p ON p.id=pc.post_id WHERE pc.category_id=c.id AND p.status='published') as post_count
    FROM categories c ORDER BY c.name ASC
  `).all();
    res.json(categories);
});

// GET /api/categories/:slug
router.get('/:slug', (req, res) => {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
});

// POST /api/categories (admin/editor only)
router.post('/', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = toSlug(name);
    try {
        const r = db.prepare('INSERT INTO categories (name, slug, description, color) VALUES (?, ?, ?, ?)').run(name, slug, description, color || '#6366f1');
        res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid));
    } catch {
        res.status(409).json({ error: 'Category already exists' });
    }
});

// PUT /api/categories/:id
router.put('/:id', authenticate, requireRole('editor', 'admin'), (req, res) => {
    const { name, description, color } = req.body;
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const slug = name ? toSlug(name) : cat.slug;
    db.prepare('UPDATE categories SET name=?, slug=?, description=?, color=? WHERE id=?')
        .run(name || cat.name, slug, description ?? cat.description, color || cat.color, cat.id);
    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id));
});

// DELETE /api/categories/:id
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;
