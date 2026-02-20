const db = require('../config/db');

const activityLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        try {
            // Only log state-changing requests
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                db.prepare(`
          INSERT INTO activity_logs (user_id, action, entity_type, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?)
        `).run(
                    req.user?.id || null,
                    `${req.method} ${req.path}`,
                    null,
                    req.ip,
                    req.headers['user-agent']?.slice(0, 200) || null
                );
            }
        } catch (e) {
            // Never crash on logging errors
        }
    });
    next();
};

module.exports = { activityLogger };
