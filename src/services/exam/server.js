// Exam Service: daftar ujian & soal (publik, butuh login) + endpoint internal
// untuk Session Service (validasi soal dan penilaian; kunci jawaban tidak pernah keluar).
const { createApp, wrap, auth, internalOnly, start } = require('../../shared/common');

const { app, pool } = createApp('exam');

app.get('/api/exams', auth, wrap(async (req, res) => {
  const [r] = await pool.query('SELECT id, judul, durasi_menit FROM exams');
  res.json(r);
}));

app.get('/api/exams/:id/questions', auth, wrap(async (req, res) => {
  const [r] = await pool.query(
    'SELECT id, teks, opsi_a, opsi_b, opsi_c, opsi_d FROM questions WHERE exam_id = ? ORDER BY id', [req.params.id]);
  res.json(r);
}));

// ---- Internal (antar-service) ----
app.get('/internal/exams/:id/question-ids', internalOnly, wrap(async (req, res) => {
  const [r] = await pool.query('SELECT id FROM questions WHERE exam_id = ?', [req.params.id]);
  res.json({ ids: r.map((x) => x.id) });
}));

// body: { answers: { "<question_id>": "A".."D" } }  ->  { benar, total }
app.post('/internal/exams/:id/score', internalOnly, wrap(async (req, res) => {
  const answers = (req.body && req.body.answers) || {};
  const [keys] = await pool.query('SELECT id, kunci FROM questions WHERE exam_id = ?', [req.params.id]);
  const benar = keys.filter((k) => answers[k.id] === k.kunci).length;
  res.json({ benar, total: keys.length });
}));

start(app, pool, 'exam');
