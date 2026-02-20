const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole, optionalAuth } = require('../middleware/auth');
const { toSlug, readTime, paginate } = require('../utils/helpers');

// GET /api/posts — public listing with filters
router.get('/', optionalAuth, (req, res) => {
    const { offset, limit } = paginate(req);
    const { category, tag, search, author, featured, sort } = req.query;

    let where = ["p.status = 'published'"];
    let params = [];

    if (category) {
        where.push('EXISTS(SELECT 1 FROM post_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.post_id=p.id AND c.slug=?)');
        params.push(category);
    }
    if (tag) {
        where.push('EXISTS(SELECT 1 FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id AND t.slug=?)');
        params.push(tag);
    }
    if (author) {
        where.push('(u.username = ? OR u.id = ?)');
        params.push(author, author);
    }
    if (featured === 'true') {
        where.push('p.is_featured = 1');
    }
    if (search) {
        where.push('(p.title LIKE ? OR p.excerpt LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }

    const orderBy = sort === 'trending' ? 'p.views DESC' : sort === 'oldest' ? 'p.published_at ASC' : 'p.published_at DESC';

    const posts = db.prepare(`
    SELECT p.id, p.uuid, p.title, p.slug, p.excerpt, p.featured_image, p.views, p.read_time,
           p.is_featured, p.is_sponsored, p.published_at,
           u.id as author_id, u.username as author_username, u.display_name as author_name, u.avatar as author_avatar,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ?) AS user_liked,
           (SELECT GROUP_CONCAT(c.name, ',') FROM post_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.post_id=p.id) as categories,
           (SELECT GROUP_CONCAT(t.name, ',') FROM post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id) as tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(req.user?.id || -1, ...params, limit, offset);

    const { c: total } = db.prepare(`
    SELECT COUNT(*) as c FROM posts p
    JOIN users u ON u.id = p.author_id
    WHERE ${where.join(' AND ')}
  `).get(...params);

    // Format categories/tags as arrays and user_liked as boolean
    const formatted = posts.map(p => ({
        ...p,
        user_liked: !!p.user_liked,
        categories: p.categories ? p.categories.split(',') : [],
        tags: p.tags ? p.tags.split(',') : []
    }));

    res.json({ posts: formatted, total, page: Math.floor(offset / limit) + 1, limit, pages: Math.ceil(total / limit) });
});

// GET /api/posts/trending (top 10 by views in last 7 days)
router.get('/trending', (req, res) => {
    const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
    const posts = db.prepare(`
    SELECT p.id, p.title, p.slug, p.featured_image, p.views, p.read_time, p.published_at,
           u.username as author_username, u.display_name as author_name, u.avatar as author_avatar
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published' AND p.published_at >= ?
    ORDER BY p.views DESC LIMIT 5
  `).all(cutoff);
    res.json(posts);
});

// GET /api/posts/mine — author's own posts (any status)
router.get('/mine', authenticate, (req, res) => {
    const { offset, limit } = paginate(req);
    const { status } = req.query;
    let where = 'p.author_id = ?';
    let params = [req.user.id];
    if (status) { where += ' AND p.status = ?'; params.push(status); }

    const posts = db.prepare(`
    SELECT p.id, p.uuid, p.title, p.slug, p.status, p.rejection_note, p.views, p.created_at, p.updated_at, p.published_at
    FROM posts p WHERE ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

    const { c: total } = db.prepare(`SELECT COUNT(*) as c FROM posts p WHERE ${where}`).get(...params);
    res.json({ posts, total });
});

// GET /api/posts/:slug — single post
router.get('/:slug', optionalAuth, (req, res) => {
    const post = db.prepare(`
    SELECT p.*,
           u.id as author_id, u.username as author_username, u.display_name as author_name,
           u.avatar as author_avatar, u.bio as author_bio,
           (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as author_followers,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ?) AS user_liked
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.slug = ? AND (p.status = 'published' OR p.author_id = ?)
  `).get(req.user?.id || -1, req.params.slug, req.user?.id || -1);

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Increment views
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);

    // Get categories
    const categories = db.prepare(`
    SELECT c.id, c.name, c.slug, c.color FROM post_categories pc
    JOIN categories c ON c.id = pc.category_id WHERE pc.post_id = ?
  `).all(post.id);

    // Get tags
    const tags = db.prepare(`
    SELECT t.id, t.name, t.slug FROM post_tags pt
    JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ?
  `).all(post.id);

    // Bookmarked?
    let is_bookmarked = false;
    if (req.user) {
        is_bookmarked = !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND post_id=?').get(req.user.id, post.id);
    }

    res.json({ ...post, categories, tags, is_bookmarked, user_liked: !!post.user_liked });
});

// POST /api/posts/:id/like — toggle like
router.post('/:id/like', authenticate, (req, res) => {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(req.user.id, post.id);

    if (existing) {
        db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(req.user.id, post.id);
        res.json({ liked: false });
    } else {
        db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(req.user.id, post.id);
        res.json({ liked: true });
    }
});

// POST /api/posts — create
router.post('/', authenticate, requireRole('subscriber', 'author', 'editor', 'admin'), (req, res) => {
    try {
        const { title, content, excerpt, featured_image, seo_title, seo_description, categories = [], tags = [], status = 'draft', is_featured = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const baseSlug = toSlug(title);
        let slug = baseSlug;
        let counter = 1;
        while (db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug)) {
            slug = `${baseSlug}-${counter++}`;
        }

        let allowedStatus = status || 'draft';
        if (!['editor', 'admin'].includes(req.user.role)) {
            // Authors/Subscribers can save as draft or pending. 
            // If they try to 'publish', we set it to 'pending'.
            if (allowedStatus === 'published') {
                allowedStatus = 'pending';
            }
        }
        const finalStatus = allowedStatus === 'published' ? 'published' : allowedStatus === 'pending' ? 'pending' : 'draft';

        const result = db.prepare(`
      INSERT INTO posts (author_id, title, slug, content, excerpt, featured_image, status, seo_title, seo_description, read_time, published_at, is_featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            req.user.id, title, slug, content, excerpt, featured_image, finalStatus,
            seo_title, seo_description, readTime(content),
            finalStatus === 'published' ? Math.floor(Date.now() / 1000) : null,
            is_featured ? 1 : 0
        );

        const postId = result.lastInsertRowid;

        // Link categories
        for (const catId of categories) {
            db.prepare('INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)').run(postId, catId);
        }
        // Link tags (auto-create if needed)
        for (const tagName of tags) {
            const tagSlug = toSlug(tagName);
            let tag = db.prepare('SELECT id FROM tags WHERE slug = ?').get(tagSlug);
            if (!tag) {
                const r = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(tagName, tagSlug);
                tag = { id: r.lastInsertRowid };
            }
            db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(postId, tag.id);
        }

        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
        res.status(201).json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// PUT /api/posts/:id — update
router.put('/:id', authenticate, (req, res) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id && !['editor', 'admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });

    const { title, content, excerpt, featured_image, seo_title, seo_description, categories = [], tags = [], status, is_featured } = req.body;

    let slug = post.slug;
    if (title && title !== post.title) {
        const baseSlug = toSlug(title);
        slug = baseSlug;
        let counter = 1;
        while (db.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').get(slug, post.id)) {
            slug = `${baseSlug}-${counter++}`;
        }
    }

    let newStatus = status || post.status;
    // Security: Only editors/admins can publish. Others restricted to draft/pending.
    if (!['editor', 'admin'].includes(req.user.role)) {
        if (newStatus === 'published') {
            newStatus = 'pending'; // Force to pending if they try to publish
        }
    }

    // Clear rejection note if re-submitting or changing status
    const rejectionNote = (newStatus === 'pending' || newStatus === 'draft') ? null : post.rejection_note;

    const published_at = newStatus === 'published' && post.status !== 'published' ? Math.floor(Date.now() / 1000) : post.published_at;

    db.prepare(`
    UPDATE posts SET title=?, slug=?, content=?, excerpt=?, featured_image=?, seo_title=?, seo_description=?,
    status=?, rejection_note=?, read_time=?, published_at=?, is_featured=?, updated_at=strftime('%s','now') WHERE id=?
  `).run(title || post.title, slug, content || post.content, excerpt || post.excerpt, featured_image || post.featured_image,
        seo_title || post.seo_title, seo_description || post.seo_description, newStatus, rejectionNote,
        readTime(content || post.content), published_at, is_featured !== undefined ? (is_featured ? 1 : 0) : post.is_featured, post.id);

    // Sync categories
    if (categories.length > 0) {
        db.prepare('DELETE FROM post_categories WHERE post_id = ?').run(post.id);
        for (const catId of categories) {
            db.prepare('INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?, ?)').run(post.id, catId);
        }
    }
    // Sync tags
    if (tags.length > 0) {
        db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(post.id);
        for (const tagName of tags) {
            const tagSlug = toSlug(tagName);
            let tag = db.prepare('SELECT id FROM tags WHERE slug = ?').get(tagSlug);
            if (!tag) {
                const r = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(tagName, tagSlug);
                tag = { id: r.lastInsertRowid };
            }
            db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(post.id, tag.id);
        }
    }

    const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
    res.json(updated);
});

// PUT /api/posts/:id/submit — submit for review
router.put('/:id/submit', authenticate, (req, res) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (post.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be submitted' });
    db.prepare("UPDATE posts SET status='pending', updated_at=strftime('%s','now') WHERE id=?").run(post.id);
    res.json({ message: 'Post submitted for review' });
});

// DELETE /api/posts/:id
router.delete('/:id', authenticate, (req, res) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id && !['editor', 'admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
    db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
    res.json({ message: 'Post deleted' });
});

module.exports = router;
