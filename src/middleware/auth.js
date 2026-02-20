const jwt = require('jsonwebtoken');
const db = require('../config/db');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT id, uuid, username, email, role, is_suspended FROM users WHERE id = ?').get(payload.id);
        if (!user) return res.status(401).json({ error: 'User not found' });
        if (user.is_suspended) return res.status(403).json({ error: 'Account suspended' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
};

const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT id, uuid, username, email, role FROM users WHERE id = ?').get(payload.id);
        req.user = user || null;
    } catch {
        req.user = null;
    }
    next();
};

module.exports = { authenticate, requireRole, optionalAuth };
