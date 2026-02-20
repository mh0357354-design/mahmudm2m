const slugify = require('slugify');

const toSlug = (text) => slugify(text, { lower: true, strict: true, trim: true });

const readTime = (content = '') => {
    const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
};

const paginate = (req) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
};

module.exports = { toSlug, readTime, paginate };
