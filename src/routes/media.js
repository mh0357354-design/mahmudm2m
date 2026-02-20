const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOADS_DIR, String(req.user?.id || 'anon'));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|svg|mp4|pdf/;
        cb(null, allowed.test(file.mimetype));
    }
});

// POST /api/media/upload
router.post('/upload', authenticate, uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid type' });

    const relativePath = path.relative(path.resolve('./'), req.file.path).replace(/\\/g, '/');
    const url = `/uploads/${req.user.id}/${req.file.filename}`;

    const r = db.prepare('INSERT INTO media (user_id, filename, original_name, mime_type, size, url) VALUES (?,?,?,?,?,?)')
        .run(req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, url);

    res.status(201).json({ id: r.lastInsertRowid, url, filename: req.file.filename, size: req.file.size });
});

// GET /api/media/mine
router.get('/mine', authenticate, (req, res) => {
    const media = db.prepare('SELECT * FROM media WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(media);
});

// DELETE /api/media/:id
router.delete('/:id', authenticate, (req, res) => {
    const item = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.user_id !== req.user.id && req.user.role !== 'admin')
        return res.status(403).json({ error: 'Forbidden' });

    const filePath = path.join(UPLOADS_DIR, String(item.user_id), item.filename);
    try { fs.unlinkSync(filePath); } catch { }
    db.prepare('DELETE FROM media WHERE id = ?').run(item.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;
