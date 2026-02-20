const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authLimiter } = require('../middleware/rateLimiter');
const { sendVerificationEmail } = require('../utils/email');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, display_name } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ error: 'username, email, and password are required' });
        if (password.length < 8)
            return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
        if (existing) return res.status(409).json({ error: 'Email or username already taken' });

        const hash = await bcrypt.hash(password, 12);
        const verifyToken = uuidv4();
        const verifyExp = Math.floor(Date.now() / 1000) + 86400; // 24h

        const result = db.prepare(`
      INSERT INTO users (username, email, password, display_name, role, verify_token, verify_token_exp)
      VALUES (?, ?, ?, ?, 'author', ?, ?)
    `).run(username, email, hash, display_name || username, verifyToken, verifyExp);

        // Fire and forget email
        sendVerificationEmail(email, verifyToken).catch(console.error);

        const user = db.prepare('SELECT id, uuid, username, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

        res.status(201).json({ token, user, message: 'Registration successful. Please verify your email.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password, totp_code } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.is_suspended) return res.status(403).json({ error: 'Account suspended' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        // 2FA check for admin
        if (user.two_fa_enabled && user.role === 'admin') {
            if (!totp_code) return res.status(200).json({ requires_2fa: true });
            const { TOTP } = require('otpauth');
            const totp = new TOTP({ secret: user.two_fa_secret });
            const delta = totp.validate({ token: totp_code, window: 1 });
            if (delta === null) return res.status(401).json({ error: 'Invalid 2FA code' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        const safeUser = { id: user.id, uuid: user.uuid, username: user.username, email: user.email, role: user.role, display_name: user.display_name, avatar: user.avatar, is_verified: user.is_verified };
        res.json({ token, user: safeUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', (req, res) => {
    const { token } = req.params;
    const now = Math.floor(Date.now() / 1000);
    const user = db.prepare('SELECT id FROM users WHERE verify_token = ? AND verify_token_exp > ?').get(token, now);
    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });
    db.prepare('UPDATE users SET is_verified = 1, verify_token = NULL, verify_token_exp = NULL WHERE id = ?').run(user.id);
    res.json({ message: 'Email verified successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
    const user = db.prepare('SELECT id, uuid, username, email, role, display_name, bio, avatar, website, twitter, github, is_verified, two_fa_enabled, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

// POST /api/auth/2fa/setup  (admin only)
router.post('/2fa/setup', authenticate, (req, res) => {
    const { TOTP, Secret } = require('otpauth');
    const secret = new Secret();
    const totp = new TOTP({ issuer: 'TechBlog', label: req.user.email, secret });
    db.prepare('UPDATE users SET two_fa_secret = ? WHERE id = ?').run(secret.base32, req.user.id);
    res.json({ secret: secret.base32, uri: totp.toString() });
});

// POST /api/auth/2fa/enable
router.post('/2fa/enable', authenticate, (req, res) => {
    const { totp_code } = req.body;
    const user = db.prepare('SELECT two_fa_secret FROM users WHERE id = ?').get(req.user.id);
    if (!user.two_fa_secret) return res.status(400).json({ error: '2FA setup not started' });
    const { TOTP } = require('otpauth');
    const totp = new TOTP({ secret: user.two_fa_secret });
    const delta = totp.validate({ token: totp_code, window: 1 });
    if (delta === null) return res.status(400).json({ error: 'Invalid code' });
    db.prepare('UPDATE users SET two_fa_enabled = 1 WHERE id = ?').run(req.user.id);
    res.json({ message: '2FA enabled' });
});

// POST /api/auth/2fa/disable
router.post('/2fa/disable', authenticate, (req, res) => {
    db.prepare('UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL WHERE id = ?').run(req.user.id);
    res.json({ message: '2FA disabled' });
});

module.exports = router;
