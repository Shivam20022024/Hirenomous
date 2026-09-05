'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Mic, MicOff, Loader2, CheckCircle2, AlertCircle, Volume2, RefreshCw, Play, Square } from 'lucide-react';
import { interviewApi } from '@/lib/interview-api';

type Phase = 'loading' | 'error' | 'welcome' | 'interview' | 'complete';

interface SessionInfo {
  candidate_first_name: string;
  job_title: string;
  status: string;
  total_questions: number;
  already_completed: boolean;
  assesses: string[];
}

interface QuestionPayload {
  done: boolean;
  question_text?: string;
  question_type?: string;
  is_followup?: boolean;
  question_number?: number;
  total_questions?: number;
  audio_file?: string | null;
  message?: string;
}

export default function CandidateInterviewPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);

  const [micState, setMicState] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'>('idle');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [turnError, setTurnError] = useState('');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [completeMessage, setCompleteMessage] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pendingBlobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- load session ---
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info: SessionInfo = await interviewApi.getSession(token);
        setSession(info);
        if (info.already_completed || info.status === 'completed') {
          setCompleteMessage('This interview has already been completed. Thank you.');
          setPhase('complete');
        } else if (info.status === 'in_progress') {
          setPhase('welcome'); // still ask for mic, then resume via start()
        } else {
          setPhase('welcome');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'This interview link is not valid.');
        setPhase('error');
      }
    })();
  }, [token]);

  const cleanupStream = useCallback(() => {
    try {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  // --- mic permission ---
  const requestMic = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('unavailable');
      return false;
    }
    setMicState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicState('granted');
      return true;
    } catch {
      setMicState('denied');
      return false;
    }
  };

  // --- play a question's audio, then arm recording ---
  const playQuestionAudio = useCallback(
    async (q: QuestionPayload) => {
      if (!q.audio_file) return;
      try {
        setAiSpeaking(true);
        const audio = new Audio(interviewApi.audioUrl(token, q.audio_file));
        audioRef.current = audio;
        await audio.play();
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
      } catch {
        // Autoplay blocked or audio failed — the question text is always shown.
      } finally {
        setAiSpeaking(false);
      }
    },
    [token],
  );

  const replayAudio = () => {
    if (question?.audio_file) playQuestionAudio(question);
  };

  // --- start / resume the interview ---
  const startInterview = async () => {
    const ok = streamRef.current ? true : await requestMic();
    // Allow continuing even without mic (text fallback), but nudge the user.
    try {
      setProcessing(true);
      setTurnError('');
      const q: QuestionPayload = await interviewApi.start(token);
      setProcessing(false);
      setPhase('interview');
      if (q.done) {
        await finishInterview();
        return;
      }
      setQuestion(q);
      if (!ok) setUseTextFallback(true);
      playQuestionAudio(q);
    } catch (err: any) {
      setProcessing(false);
      if (err?.status === 410) {
        setErrorMsg(err.message);
        setPhase('error');
      } else {
        setTurnError(err?.message || 'Could not start the interview. Please retry.');
        setPhase('welcome');
      }
    }
  };

  // --- recording ---
  const beginRecording = () => {
    if (!streamRef.current) {
      setUseTextFallback(true);
      return;
    }
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(streamRef.current);
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        pendingBlobRef.current = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setUseTextFallback(true);
    }
  };

  const stopAndSubmit = async () => {
    if (recorderRef.current?.state === 'recording') {
      await new Promise<void>((resolve) => {
        recorderRef.current!.onstop = () => {
          pendingBlobRef.current = new Blob(chunksRef.current, {
            type: chunksRef.current[0]?.type || 'audio/webm',
          });
          resolve();
        };
        recorderRef.current!.stop();
      });
    }
    setRecording(false);
    await submitTurn(pendingBlobRef.current || undefined, undefined);
  };

  const submitTextAnswer = async () => {
    if (!textAnswer.trim()) return;
    await submitTurn(undefined, textAnswer.trim());
    setTextAnswer('');
  };

  const submitTurn = async (audio?: Blob, answerText?: string) => {
    setProcessing(true);
    setTurnError('');
    try {
      const next: QuestionPayload = await interviewApi.turn(token, {
        audio,
        answerText,
        turnSeq: question?.question_number,
      });
      pendingBlobRef.current = null;
      setProcessing(false);
      if (next.done) {
        await finishInterview();
        return;
      }
      setQuestion(next);
      playQuestionAudio(next);
    } catch (err: any) {
      setProcessing(false);
      if (err?.status === 410 || err?.status === 409) {
        // Interview ended elsewhere (cancelled / already completed / expired)
        setErrorMsg(err.message);
        setPhase('error');
      } else {
        // Network / transient — keep the recorded answer so the candidate can retry.
        setTurnError(err?.message || 'Network problem submitting your answer. Please retry.');
      }
    }
  };

  const retryTurn = async () => {
    await submitTurn(pendingBlobRef.current || undefined, textAnswer.trim() || undefined);
  };

  const finishInterview = async () => {
    try {
      const res = await interviewApi.complete(token);
      setCompleteMessage(res?.message || 'Your interview is complete. Thank you for your time.');
    } catch {
      setCompleteMessage('Your interview has ended. Thank you for your time.');
    } finally {
      cleanupStream();
      setPhase('complete');
    }
  };

  // ================= render =================

  if (phase === 'loading') {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Centered>
    );
  }

  if (phase === 'error') {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Interview unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
          <p className="mt-4 text-xs text-muted-foreground">Please contact the recruiter who sent you this link.</p>
        </div>
      </Centered>
    );
  }

  if (phase === 'complete') {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Interview complete</h1>
          <p className="mt-2 text-sm text-muted-foreground">{completeMessage}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            The hiring team will review your responses and be in touch. You can close this tab.
          </p>
        </div>
      </Centered>
    );
  }

  if (phase === 'welcome') {
    return (
      <Centered>
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">AI Interview</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{session?.job_title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Hi {session?.candidate_first_name}, welcome to your AI interview. It will take about 20–30 minutes
            and assess your:
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {(session?.assesses || []).map((a) => (
              <li key={a} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {a}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Before you start</p>
            <ul className="mt-2 space-y-1">
              <li>• Use a quiet room and a stable internet connection.</li>
              <li>• Allow microphone access when prompted.</li>
              <li>• Answer each question out loud, then press “Stop answer”.</li>
              <li>• Complete the interview in one sitting.</li>
            </ul>
          </div>

          {micState === 'denied' && (
            <p className="mt-3 text-xs font-medium text-destructive">
              Microphone access was blocked. You can still continue by typing your answers, or enable the
              microphone in your browser settings and retry.
            </p>
          )}
          {micState === 'unavailable' && (
            <p className="mt-3 text-xs font-medium text-destructive">
              No microphone was detected. You can continue by typing your answers.
            </p>
          )}
          {turnError && <p className="mt-3 text-xs font-medium text-destructive">{turnError}</p>}

          <button
            onClick={startInterview}
            disabled={processing || micState === 'requesting'}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-50"
          >
            {processing || micState === 'requesting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Start Interview
              </>
            )}
          </button>
        </div>
      </Centered>
    );
  }

  // phase === 'interview'
  const qNum = question?.question_number || 1;
  const qTotal = question?.total_questions || session?.total_questions || 1;

  return (
    <Centered>
      <div className="w-full max-w-xl">
        <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span>AI Interview · {session?.job_title}</span>
          <span>
            {question?.is_followup ? 'Follow-up' : `Question ${qNum} of ${qTotal}`}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (qNum / qTotal) * 100)}%` }}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <Volume2 size={14} />
            </div>
            AI Interviewer
          </div>

          <p className="mt-4 text-lg font-medium leading-relaxed text-foreground">
            {question?.question_text}
          </p>

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            {aiSpeaking ? (
              <span className="flex items-center gap-1.5 text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> AI speaking…
              </span>
            ) : question?.audio_file ? (
              <button onClick={replayAudio} className="flex items-center gap-1 hover:text-foreground">
                <Play size={12} /> Replay question
              </button>
            ) : null}
          </div>

          <div className="mt-6 border-t border-border pt-6">
            {processing ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Processing your answer…
              </div>
            ) : useTextFallback ? (
              <div>
                <textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type your answer…"
                  className="h-28 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={turnError ? retryTurn : submitTextAnswer}
                  disabled={!textAnswer.trim() && !turnError}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {turnError ? 'Retry submit' : 'Submit answer'}
                </button>
                {streamRef.current && (
                  <button
                    onClick={() => setUseTextFallback(false)}
                    className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Switch back to voice
                  </button>
                )}
              </div>
            ) : recording ? (
              <button
                onClick={stopAndSubmit}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 text-sm font-bold text-destructive transition hover:bg-destructive/20"
              >
                <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                <Square size={14} /> Stop answer
              </button>
            ) : turnError ? (
              <div>
                <p className="mb-3 text-center text-xs font-medium text-destructive">{turnError}</p>
                <button
                  onClick={retryTurn}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  <RefreshCw size={14} /> Retry submitting answer
                </button>
              </div>
            ) : (
              <button
                onClick={beginRecording}
                disabled={aiSpeaking}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-50"
              >
                {streamRef.current ? <Mic size={16} /> : <MicOff size={16} />}
                {streamRef.current ? 'Record answer' : 'Type answer instead'}
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Your answers are recorded and reviewed by the hiring team. Do not refresh unless necessary — your
          progress is saved.
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}
