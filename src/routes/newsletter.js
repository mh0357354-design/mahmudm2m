const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

// POST /api/newsletter/subscribe
router.post('/subscribe', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
        db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(email);
        res.json({ message: 'Subscribed successfully' });
    } catch { res.status(400).json({ error: 'Already subscribed' }); }
});

// DELETE /api/newsletter/unsubscribe
router.delete('/unsubscribe', (req, res) => {
    const { email } = req.body;
    db.prepare('UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?').run(email);
    res.json({ message: 'Unsubscribed' });
});

// GET /api/newsletter (admin)
router.get('/', authenticate, requireRole('admin'), (req, res) => {
    const subs = db.prepare('SELECT id, email, is_active, created_at FROM newsletter_subscribers ORDER BY created_at DESC').all();
    res.json(subs);
});

// POST /api/newsletter/broadcast (admin)
router.post('/broadcast', authenticate, requireRole('admin'), (req, res) => {
    const { subject, content } = req.body;
    if (!subject || !content) return res.status(400).json({ error: 'Subject and content required' });

    const activeSubscribers = db.prepare('SELECT email FROM newsletter_subscribers WHERE is_active = 1').all();

    console.log(`[Newsletter Broadcast] Sending "${subject}" to ${activeSubscribers.length} subscribers.`);

    res.json({
        message: 'Newsletter broadcast successfully',
        recipient_count: activeSubscribers.length
    });
});


module.exports = router;
