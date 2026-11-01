// Membuat database, tabel, dan data dummy. Aman dijalankan ulang.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB = process.env.DB_NAME || 'cbt_portal';
const QUESTIONS = [
  ['Model layanan cloud yang menyediakan mesin virtual dan jaringan adalah...', 'SaaS', 'PaaS', 'IaaS', 'FaaS', 'C'],
  ['Docker Volume digunakan untuk...', 'Mempercepat build image', 'Menyimpan data agar persisten', 'Mengenkripsi container', 'Menambah RAM', 'B'],
  ['RPO adalah...', 'Waktu maksimal sistem boleh mati', 'Jumlah maksimal data yang boleh hilang', 'Kecepatan jaringan', 'Jumlah server', 'B'],
  ['RTO adalah...', 'Waktu maksimal pemulihan sistem', 'Jumlah user maksimal', 'Ukuran backup', 'Frekuensi backup', 'A'],
  ['Backend stateless berarti...', 'Tidak menyimpan state di memori proses', 'Tidak memakai database', 'Tidak bisa di-restart', 'Hanya satu user', 'A'],
  ['Perintah untuk menjalankan semua service di docker-compose secara background:', 'docker compose build', 'docker compose up -d', 'docker compose down', 'docker compose logs', 'B'],
  ['Alat load testing berikut yang benar adalah...', 'k6', 'Nginx', 'MySQL', 'Redis', 'A'],
  ['Mekanisme menyimpan jawaban baru atau memperbarui yang lama tanpa duplikat disebut...', 'Join', 'Upsert', 'Truncate', 'Index', 'B'],
  ['Utilitas backup logis untuk MySQL adalah...', 'mysqldump', 'pg_dump', 'rsync', 'tar', 'A'],
  ['Health check endpoint dipakai untuk...', 'Mengecek apakah layanan sehat', 'Menghapus data', 'Mengganti password', 'Menambah soal', 'A'],
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`);
  await c.query(`USE \`${DB}\``);
  await c.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const [[{ n }]] = await c.query('SELECT COUNT(*) AS n FROM students');
  if (n === 0) {
    const hash = await bcrypt.hash('password123', 10);
    for (let i = 1; i <= 5; i++) {
      await c.query('INSERT INTO students (nim, nama, password_hash) VALUES (?,?,?)', [`202400${i}`, `Siswa Dummy ${i}`, hash]);
    }
    const [r] = await c.query('INSERT INTO exams (judul, durasi_menit) VALUES (?,?)', ['Ujian Dasar Cloud Computing', 30]);
    for (const q of QUESTIONS) {
      await c.query('INSERT INTO questions (exam_id, teks, opsi_a, opsi_b, opsi_c, opsi_d, kunci) VALUES (?,?,?,?,?,?,?)', [r.insertId, ...q]);
    }
    console.log('Data dummy dibuat: 5 siswa (NIM 2024001-2024005, password: password123), 1 ujian, 10 soal.');
  } else {
    console.log('Data sudah ada, seed dilewati.');
  }
  await c.end();
  console.log('Setup selesai.');
})().catch((e) => { console.error('Setup gagal:', e.message); process.exit(1); });
