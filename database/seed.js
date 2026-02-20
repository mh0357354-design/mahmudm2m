require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

async function seed() {
  console.log('🌱 Seeding database...');

  // Admin user
  const adminHash = await bcrypt.hash('Mh907878', 12);
  db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password, display_name, role, is_verified)
    VALUES ('mahmud9078', 'admin@techblog.com', ?, 'Mahmud', 'admin', 1)
  `).run(adminHash);

  // Also update existing admin if it exists with different name
  db.prepare(`
    UPDATE users SET username = 'mahmud9078', password = ?, display_name = 'Mahmud' WHERE role = 'admin'
  `).run(adminHash);

  // Author user
  const authorHash = await bcrypt.hash('Author1234!', 12);
  db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password, display_name, bio, role, is_verified)
    VALUES ('janedoe', 'jane@techblog.com', ?, 'Jane Doe', 'Tech writer & AI enthusiast.', 'author', 1)
  `).run(authorHash);

  // Subscriber user
  const subHash = await bcrypt.hash('Sub1234!', 12);
  db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password, display_name, role, is_verified)
    VALUES ('johndoe', 'john@techblog.com', ?, 'John Doe', 'subscriber', 1)
  `).run(subHash);

  // Categories
  const cats = [
    { name: 'Artificial Intelligence', color: '#6366f1' },
    { name: 'Web Development', color: '#06b6d4' },
    { name: 'Gadgets', color: '#f59e0b' },
    { name: 'Software Reviews', color: '#10b981' },
    { name: 'Cybersecurity', color: '#ef4444' },
    { name: 'App Development', color: '#8b5cf6' },
    { name: 'Tech News', color: '#ec4899' },
  ];
  for (const cat of cats) {
    const slug = cat.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    db.prepare('INSERT OR IGNORE INTO categories (name, slug, color) VALUES (?, ?, ?)').run(cat.name, slug, cat.color);
  }

  const aiCat = db.prepare("SELECT id FROM categories WHERE slug='artificial-intelligence'").get();
  const webCat = db.prepare("SELECT id FROM categories WHERE slug='web-development'").get();
  const author = db.prepare("SELECT id FROM users WHERE username='janedoe'").get();

  // Tags
  const tagNames = ['javascript', 'react', 'nodejs', 'python', 'machine-learning', 'chatgpt', 'rust', 'typescript', 'nextjs', 'docker'];
  for (const t of tagNames) {
    db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').run(t, t);
  }
  const tagJS = db.prepare("SELECT id FROM tags WHERE slug='javascript'").get();
  const tagReact = db.prepare("SELECT id FROM tags WHERE slug='react'").get();
  const tagML = db.prepare("SELECT id FROM tags WHERE slug='machine-learning'").get();

  // Posts
  const now = Math.floor(Date.now() / 1000);
  const content1 = `<h2>The Rise of AI in 2025</h2><p>Artificial intelligence has transformed every industry in ways we could barely imagine five years ago. From natural language processing to computer vision, AI is now deeply embedded in modern software products.</p><p>In this article, we explore the key trends that defined AI in 2025 and what we can expect going forward.</p><h3>Large Language Models</h3><p>GPT-5 and its competitors have redefined what's possible with text generation. With context windows exceeding 1 million tokens, LLMs can now process entire codebases in a single prompt.</p><h3>Multimodal AI</h3><p>Models that understand images, audio, and video simultaneously are now commercially available, opening up entirely new categories of applications.</p>`;
  const content2 = `<h2>Building Scalable APIs with Node.js</h2><p>Node.js remains one of the most popular choices for building high-performance APIs. In this deep-dive, we'll cover best practices for building production-ready REST APIs.</p><h3>Architecture Patterns</h3><p>Using a layered architecture (routes → controllers → services → data access) keeps your codebase maintainable as it scales.</p><pre><code class="language-javascript">// Example controller
const createPost = async (req, res) => {
  const post = await PostService.create(req.body);
  res.status(201).json(post);
};</code></pre><h3>Security Considerations</h3><p>Always validate and sanitize input, use parameterized queries, and implement rate limiting on public endpoints.</p>`;

  const r1 = db.prepare(`
    INSERT OR IGNORE INTO posts (author_id, title, slug, excerpt, content, status, is_featured, read_time, published_at)
    VALUES (?, ?, ?, ?, ?, 'published', 1, 5, ?)
  `).run(author.id, 'The Rise of AI in 2025', 'the-rise-of-ai-in-2025', 'How artificial intelligence transformed every industry in 2025.', content1, now - 86400);

  const r2 = db.prepare(`
    INSERT OR IGNORE INTO posts (author_id, title, slug, excerpt, content, status, read_time, published_at)
    VALUES (?, ?, ?, ?, ?, 'published', 7, ?)
  `).run(author.id, 'Building Scalable APIs with Node.js', 'building-scalable-apis-nodejs', 'Best practices for production-ready REST APIs using Node.js and Express.', content2, now - 172800);

  const r3 = db.prepare(`
    INSERT OR IGNORE INTO posts (author_id, title, slug, excerpt, content, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(author.id, 'My Draft Post on Cybersecurity', 'my-draft-post-cybersecurity', 'An upcoming post about modern cybersecurity threats.', '<p>Coming soon...</p>');

  if (r1.lastInsertRowid) {
    db.prepare('INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?,?)').run(r1.lastInsertRowid, aiCat.id);
    db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?,?)').run(r1.lastInsertRowid, tagML.id);
  }
  if (r2.lastInsertRowid) {
    db.prepare('INSERT OR IGNORE INTO post_categories (post_id, category_id) VALUES (?,?)').run(r2.lastInsertRowid, webCat.id);
    db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?,?)').run(r2.lastInsertRowid, tagJS.id);
    db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?,?)').run(r2.lastInsertRowid, tagReact.id);
  }

  // Newsletter subscribers
  db.prepare("INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES ('demo@example.com')").run();

  console.log('✅ Seed complete!');
  console.log('   Admin:  mahmud9078         / Mh907878');
  console.log('   Author: jane@techblog.com   / Author1234!');
  console.log('   User:   john@techblog.com   / Sub1234!');
}

seed().catch(console.error);
