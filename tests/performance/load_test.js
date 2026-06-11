import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    burst_100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '20s',
      exec: 'runAgent'
    },
    burst_500: {
      executor: 'constant-vus',
      vus: 500,
      duration: '15s',
      exec: 'runAgent'
    },
    burst_1000: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '10s',
      exec: 'runAgent'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.95']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const payload = {
  userId: __ENV.PERF_USER_ID || '00000000-0000-0000-0000-000000000000',
  conversationId: __ENV.PERF_CONVERSATION_ID || '00000000-0000-0000-0000-000000000000',
  message: 'Performance load test message',
  workflow: ['Planner', 'Executor', 'Reviewer']
};

export function runAgent() {
  const res = http.post(`${BASE_URL}/api/agent/run`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, {
    'status is 202 or 400': (r) => r.status === 202 || r.status === 400,
    'response time under 3s': (r) => r.timings.duration < 3000
  });

  sleep(1);
}
