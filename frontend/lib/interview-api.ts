/**
 * Candidate interview-session API client.
 *
 * Deliberately separate from `lib/api.ts`: the candidate flow authenticates ONLY
 * with the opaque interview token in the URL. It must never read or send the
 * recruiter JWT from localStorage.
 */
import { API_BASE_URL } from '@/lib/api';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = data?.detail || detail;
    } catch {}
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.blob();
}

export const interviewApi = {
  getSession: (token: string) =>
    request(`/interview-session/${encodeURIComponent(token)}`),

  start: (token: string) =>
    request(`/interview-session/${encodeURIComponent(token)}/start`, { method: 'POST' }),

  /** Submit an answer. `audio` is a Blob from MediaRecorder; falls back to text. */
  turn: (token: string, opts: { audio?: Blob; answerText?: string; turnSeq?: number }) => {
    const form = new FormData();
    if (opts.audio) form.append('audio', opts.audio, 'answer.webm');
    if (opts.answerText) form.append('answer_text', opts.answerText);
    if (opts.turnSeq != null) form.append('turn_seq', String(opts.turnSeq));
    return request(`/interview-session/${encodeURIComponent(token)}/turn`, {
      method: 'POST',
      body: form,
    });
  },

  complete: (token: string) =>
    request(`/interview-session/${encodeURIComponent(token)}/complete`, { method: 'POST' }),

  audioUrl: (token: string, filename: string) =>
    `${API_BASE_URL}/interview-session/${encodeURIComponent(token)}/audio/${encodeURIComponent(filename)}`,
};
