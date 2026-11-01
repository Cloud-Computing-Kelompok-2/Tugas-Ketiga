// Auth Service: login, logout, profil. Sesi disimpan di MySQL (dipakai bersama service lain).
const bcrypt = require('bcryptjs');
const { createApp, wrap, auth, start } = require('../../shared/common');

const { app, pool } = createApp('auth', { cleanSessions: true });

app.post('/api/login', wrap(async (req, res) => {
  const { nim, password } = req.body || {};
  const [r] = await pool.query('SELECT * FROM students WHERE nim = ?', [nim]);
  if (!r[0] || !(await bcrypt.compare(String(password || ''), r[0].password_hash))) {
    return res.status(401).json({ error: 'NIM atau password salah' });
  }
  req.session.studentId = r[0].id;
  res.json({ id: r[0].id, nim: r[0].nim, nama: r[0].nama });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const [r] = await pool.query('SELECT id, nim, nama FROM students WHERE id = ?', [req.session.studentId]);
  res.json(r[0]);
}));

app.post('/api/logout', wrap(async (req, res) => {
  req.session.destroy(() => res.json({ status: 'bye' }));
}));

start(app, pool, 'auth');
