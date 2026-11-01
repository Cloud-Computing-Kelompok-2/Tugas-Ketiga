// Session Service: sesi ujian, autosave jawaban, selesai ujian.
// Memanggil Exam Service (HTTP internal) untuk validasi soal dan penilaian.
const { createApp, wrap, auth, callService, start } = require('../../shared/common');

const EXAM_URL = process.env.EXAM_SERVICE_URL || 'http://exam-service:3000';
const { app, pool } = createApp('session');

// Sisa waktu dihitung di database (server), bukan di browser.
async function ownSession(id, studentId) {
  const [r] = await pool.query(
    `SELECT s.id, s.exam_id, s.status,
            e.durasi_menit * 60 - TIMESTAMPDIFF(SECOND, s.started_at, NOW()) AS sisa
       FROM exam_sessions s JOIN exams e ON e.id = s.exam_id
      WHERE s.id = ? AND s.student_id = ?`, [id, studentId]);
  return r[0];
}

// Cache daftar id soal per ujian (60 dtk). Bila Exam Service sedang down,
// cache lama tetap dipakai supaya autosave jawaban peserta tidak terhenti.
const qCache = new Map();
async function questionIds(examId) {
  const c = qCache.get(examId);
  if (c && Date.now() - c.at < 60000) return c.ids;
  try {
    const r = await callService(EXAM_URL, `/internal/exams/${examId}/question-ids`);
    const ids = new Set(r.status === 200 ? r.data.ids : []);
    qCache.set(examId, { ids, at: Date.now() });
    return ids;
  } catch (e) {
    if (c) return c.ids;
    throw e;
  }
}

app.post('/api/sessions/start', auth, wrap(async (req, res) => {
  const examId = +(req.body || {}).exam_id;
  await pool.query('INSERT IGNORE INTO exam_sessions (student_id, exam_id) VALUES (?, ?)', [req.session.studentId, examId]);
  const [r] = await pool.query('SELECT id FROM exam_sessions WHERE student_id = ? AND exam_id = ?', [req.session.studentId, examId]);
  if (!r[0]) return res.status(404).json({ error: 'ujian tidak ditemukan' });
  res.json({ session_id: r[0].id });
}));

app.get('/api/sessions/:id', auth, wrap(async (req, res) => {
  const s = await ownSession(req.params.id, req.session.studentId);
  if (!s) return res.status(404).json({ error: 'sesi tidak ditemukan' });
  const [a] = await pool.query('SELECT question_id, pilihan FROM answers WHERE session_id = ?', [s.id]);
  const answers = {};
  a.forEach((x) => { answers[x.question_id] = x.pilihan; });
  res.json({
    session: { id: s.id, exam_id: s.exam_id, status: s.status, sisa_detik: Math.max(0, s.sisa) },
    answers,
  });
}));

// Autosave: satu jawaban per request, UPSERT (aman untuk retry), langsung commit ke MySQL.
app.put('/api/sessions/:id/answers', auth, wrap(async (req, res) => {
  const s = await ownSession(req.params.id, req.session.studentId);
  if (!s) return res.status(404).json({ error: 'sesi tidak ditemukan' });
  if (s.status !== 'ongoing' || s.sisa <= 0) return res.status(403).json({ error: 'ujian sudah berakhir' });
  const { question_id, pilihan } = req.body || {};
  if (!/^[A-D]$/.test(pilihan)) return res.status(400).json({ error: 'pilihan tidak valid' });
  const qid = +question_id;
  if (!(await questionIds(s.exam_id)).has(qid)) return res.status(404).json({ error: 'soal tidak ditemukan' });
  await pool.query(
    `INSERT INTO answers (session_id, question_id, pilihan) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE pilihan = VALUES(pilihan), saved_at = CURRENT_TIMESTAMP(3)`,
    [s.id, qid, pilihan]);
  res.json({ status: 'saved', question_id: qid, saved_at: new Date().toISOString() });
}));

// Idempotent: status diubah hanya jika masih 'ongoing', jadi aman di-retry
// bila Exam Service gagal merespons saat penilaian.
app.post('/api/sessions/:id/finish', auth, wrap(async (req, res) => {
  const s = await ownSession(req.params.id, req.session.studentId);
  if (!s) return res.status(404).json({ error: 'sesi tidak ditemukan' });
  await pool.query("UPDATE exam_sessions SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'ongoing'", [s.id]);
  const [a] = await pool.query('SELECT question_id, pilihan FROM answers WHERE session_id = ?', [s.id]);
  const answers = {};
  a.forEach((x) => { answers[x.question_id] = x.pilihan; });
  const r = await callService(EXAM_URL, `/internal/exams/${s.exam_id}/score`, { method: 'POST', body: { answers } });
  if (r.status !== 200) return res.status(502).json({ error: 'penilaian gagal' });
  res.json({ status: 'finished', benar: r.data.benar, total: r.data.total });
}));

start(app, pool, 'session');
