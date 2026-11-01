import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const VU = parseInt(__ENV.VU || '10');
const HOLD = __ENV.HOLD || '2m';
const DEBUG = __ENV.DEBUG === '1';

export const options = {
  stages: [
    { duration: '30s', target: VU },   // ramp-up
    { duration: HOLD, target: VU },    // tahan
    { duration: '15s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

function p(name) {
  return { headers: { 'Content-Type': 'application/json' }, tags: { name } };
}

export default function () {
  const nim = `202400${1 + (__VU % 5)}`;

  const login = http.post(`${BASE}/api/login`,
    JSON.stringify({ nim, password: 'password123' }), p('login'));
  if (!check(login, { 'login 200': (r) => r.status === 200 })) { sleep(1); return; }

  const start = http.post(`${BASE}/api/sessions/start`,
    JSON.stringify({ exam_id: 1 }), p('start'));
  const okStart = check(start, { 'start ok': (r) => r.status === 200 || r.status === 201 });
  if (!okStart) {
    if (DEBUG) console.log(`start gagal: ${start.status} ${start.body}`);
    sleep(1); return;
  }
  const sid = start.json('session_id');

  for (let q = 1; q <= 10; q++) {
    const r = http.put(`${BASE}/api/sessions/${sid}/answers`,
      JSON.stringify({ question_id: q, pilihan: 'ABCD'[q % 4] }), p('autosave'));
    check(r, { 'autosave 200': (x) => x.status === 200 });
    sleep(0.3);
  }
}