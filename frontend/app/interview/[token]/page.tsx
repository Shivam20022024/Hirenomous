'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Video, VideoOff, Mic, MicOff, Volume2, Wifi, Loader2, CheckCircle2, AlertCircle,
  Play, Square, RefreshCw, Circle, Keyboard, ChevronDown, Subtitles, Timer,
  PhoneOff, Sparkles, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { interviewApi } from '@/lib/interview-api';

type Phase = 'loading' | 'error' | 'complete' | 'verify' | 'device-check' | 'interview';
type MediaState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'unsupported';

interface SessionInfo {
  candidate_first_name: string;
  candidate_name?: string;
  job_title: string;
  status: string;
  mode?: string;
  total_questions: number;
  answered_questions?: number;
  in_progress?: boolean;
  already_completed: boolean;
  requires_email_verification?: boolean;
  email_verified?: boolean;
  assesses: string[];
}

interface QuestionPayload {
  done: boolean;
  question_text?: string;
  is_followup?: boolean;
  question_number?: number;
  total_questions?: number;
  audio_file?: string | null;
  message?: string;
}

const VIDEO_MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const AUDIO_MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const pickMime = (list: string[]) =>
  typeof MediaRecorder !== 'undefined'
    ? list.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } })
    : undefined;

export default function CandidateVideoInterviewPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);

  const [media, setMedia] = useState<MediaState>('idle');
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speakerOk, setSpeakerOk] = useState(true);
  const [online, setOnline] = useState(true);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [callElapsed, setCallElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [turnError, setTurnError] = useState('');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [completeMessage, setCompleteMessage] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Interactive UI controls
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Hands-free Voice Activity Detection (VAD) states
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState(false);
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const vRecRef = useRef<MediaRecorder | null>(null);
  const aRecRef = useRef<MediaRecorder | null>(null);
  const vChunks = useRef<Blob[]>([]);
  const aChunks = useRef<Blob[]>([]);
  const pendingVideo = useRef<Blob | null>(null);
  const pendingAudio = useRef<Blob | null>(null);
  const pendingDuration = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionRef = useRef<QuestionPayload | null>(null);

  // VAD refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const isSubmittingTurnRef = useRef(false);

  // ---- integrity telemetry (accumulated per question, best-effort) ----
  const focusLost = useRef(0);
  const focusLostMs = useRef(0);
  const pasteCount = useRef(0);
  const fsExits = useRef(0);
  const blurStart = useRef<number | null>(null);
  const answerReadyAt = useRef<number>(0);
  const firstInteractionAt = useRef<number | null>(null);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);

  const resetSignals = useCallback(() => {
    focusLost.current = 0;
    focusLostMs.current = 0;
    pasteCount.current = 0;
    fsExits.current = 0;
    blurStart.current = null;
    firstInteractionAt.current = null;
    answerReadyAt.current = Date.now();
  }, []);

  const markFirstInteraction = () => {
    if (firstInteractionAt.current == null) firstInteractionAt.current = Date.now();
  };

  // ---- load session ----
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info: SessionInfo = await interviewApi.getSession(token);
        setSession(info);
        if (info.already_completed || info.status === 'completed') {
          setCompleteMessage('This interview has already been completed. Thank you.');
          setPhase('complete');
        } else if (info.requires_email_verification && !info.email_verified) {
          setPhase('verify');
        } else {
          setPhase('device-check');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'This interview link is not valid.');
        setPhase('error');
      }
    })();
  }, [token]);

  // Overall call elapsed timer
  useEffect(() => {
    if (phase !== 'interview') return;
    const interval = setInterval(() => {
      setCallElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Integrity telemetry
  useEffect(() => {
    if (phase !== 'interview') return;
    const markBlur = () => { if (blurStart.current == null) blurStart.current = Date.now(); };
    const markFocus = () => {
      if (blurStart.current != null) {
        focusLost.current += 1;
        focusLostMs.current += Date.now() - blurStart.current;
        blurStart.current = null;
      }
    };
    const onVis = () => (document.visibilityState === 'hidden' ? markBlur() : markFocus());
    const onPaste = () => { pasteCount.current += 1; };
    const onFs = () => { if (!document.fullscreenElement) fsExits.current += 1; };
    window.addEventListener('blur', markBlur);
    window.addEventListener('focus', markFocus);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('paste', onPaste);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('blur', markBlur);
      window.removeEventListener('focus', markFocus);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [phase]);

  const stopVadMonitoring = useCallback(() => {
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    setIsCandidateSpeaking(false);
    setAutoSubmitCountdown(null);
  }, []);

  const stopStream = useCallback(() => {
    stopVadMonitoring();
    try { if (vRecRef.current?.state === 'recording') vRecRef.current.stop(); } catch {}
    try { if (aRecRef.current?.state === 'recording') aRecRef.current.stop(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try { audioCtxRef.current.close(); } catch {}
    }
  }, [stopVadMonitoring]);

  useEffect(() => () => stopStream(), [stopStream]);

  // ---- camera + mic ----
  const requestMedia = async (): Promise<boolean> => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMedia('unsupported');
      return false;
    }
    setMedia('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setCamOn(stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live'));
      setMicOn(stream.getAudioTracks().some((t) => t.enabled && t.readyState === 'live'));
      stream.getVideoTracks()[0]?.addEventListener('ended', () => setCamOn(false));
      stream.getAudioTracks()[0]?.addEventListener('ended', () => setMicOn(false));
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setSpeakerOk(devices.some((d) => d.kind === 'audiooutput'));
      } catch {}
      setMedia('granted');
      return true;
    } catch (e: any) {
      setMedia(e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError' ? 'unavailable' : 'denied');
      return false;
    }
  };

  const toggleCam = () => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getVideoTracks();
    tracks.forEach((t) => { t.enabled = !t.enabled; });
    setCamOn(tracks.some((t) => t.enabled));
  };

  const toggleMic = () => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getAudioTracks();
    tracks.forEach((t) => { t.enabled = !t.enabled; });
    setMicOn(tracks.some((t) => t.enabled));
  };

  // attach stream to <video> whenever we have both
  useEffect(() => {
    if (videoElRef.current && streamRef.current && media === 'granted') {
      videoElRef.current.srcObject = streamRef.current;
      videoElRef.current.play().catch(() => {});
    }
  }, [media, phase]);

  // ---- submission logic forward refs ----
  const stopAndSubmitRef = useRef<(() => Promise<void>) | null>(null);
  const beginRecordingRef = useRef<(() => void) | null>(null);

  // ---- VAD silence monitoring ----
  const startVadMonitoring = useCallback(() => {
    if (!streamRef.current) return;
    stopVadMonitoring();
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtxClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      const audioCtx = audioCtxRef.current;
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (!audioTrack || !audioTrack.enabled) return;

      const sourceStream = new MediaStream([audioTrack]);
      const source = audioCtx.createMediaStreamSource(sourceStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudio = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Vocal frequency bins: human voice is centered between ~350Hz and ~3500Hz
        // In 256-point FFT at 48kHz, bin width is 187Hz. Bins 2 to 22 focus purely on human vocal energy.
        // This filters out low-frequency ceiling fan hum, air noise, and desk vibrations.
        let vocalSum = 0;
        let vocalBins = 0;
        for (let i = 2; i <= 22 && i < bufferLength; i++) {
          vocalSum += dataArray[i];
          vocalBins++;
        }
        const vocalEnergy = vocalBins > 0 ? vocalSum / vocalBins : 0;

        // Realistic speech threshold for vocal band (speech is usually 35-90, room noise in vocal band is 5-22)
        const isSpeaking = vocalEnergy > 30;

        setIsCandidateSpeaking(isSpeaking);

        if (isSpeaking) {
          hasSpokenRef.current = true;
          if (speechStartTimeRef.current === null) speechStartTimeRef.current = Date.now();
          silenceStartRef.current = null;
          setAutoSubmitCountdown(null);
        } else if (hasSpokenRef.current) {
          const spokenDuration = speechStartTimeRef.current ? Date.now() - speechStartTimeRef.current : 0;
          // After speaking for at least 1.5 seconds, silence triggers auto-submit
          if (spokenDuration >= 1500) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else {
              const silentMs = Date.now() - silenceStartRef.current;
              const remaining = Math.max(0, Math.ceil((2500 - silentMs) / 1000));
              setAutoSubmitCountdown(remaining);

              if (silentMs >= 2500 && !isSubmittingTurnRef.current) {
                stopVadMonitoring();
                if (stopAndSubmitRef.current) {
                  stopAndSubmitRef.current();
                }
                return;
              }
            }
          }
        }

        vadRafRef.current = requestAnimationFrame(checkAudio);
      };

      vadRafRef.current = requestAnimationFrame(checkAudio);
    } catch (e) {
      console.warn('VAD init warning:', e);
    }
  }, [stopVadMonitoring]);

  // ---- recording (dual: video for review + audio for STT) ----
  const beginRecording = useCallback(() => {
    if (!streamRef.current || useTextFallback) return;
    if (vRecRef.current?.state === 'recording') return;

    markFirstInteraction();
    vChunks.current = [];
    aChunks.current = [];
    setRecSeconds(0);
    hasSpokenRef.current = false;
    speechStartTimeRef.current = null;
    silenceStartRef.current = null;
    setAutoSubmitCountdown(null);
    setIsCandidateSpeaking(false);

    try {
      const vType = pickMime(VIDEO_MIME);
      const aType = pickMime(AUDIO_MIME);
      const vRec = new MediaRecorder(streamRef.current, vType ? { mimeType: vType } : undefined);
      vRec.ondataavailable = (e) => e.data.size > 0 && vChunks.current.push(e.data);
      vRecRef.current = vRec;

      const audioOnly = new MediaStream(streamRef.current.getAudioTracks());
      const aRec = new MediaRecorder(audioOnly, aType ? { mimeType: aType } : undefined);
      aRec.ondataavailable = (e) => e.data.size > 0 && aChunks.current.push(e.data);
      aRecRef.current = aRec;

      vRec.start();
      aRec.start();
      setRecording(true);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);

      startVadMonitoring();
    } catch {
      setShowTextModal(true);
    }
  }, [useTextFallback, startVadMonitoring]);

  beginRecordingRef.current = beginRecording;

  // ---- AI question audio & auto-listen flow ----
  const playQuestionAudio = useCallback(async (q: QuestionPayload) => {
    stopVadMonitoring();
    try {
      if (vRecRef.current?.state === 'recording') vRecRef.current.stop();
      if (aRecRef.current?.state === 'recording') aRecRef.current.stop();
    } catch {}
    setRecording(false);

    if (!q.audio_file) {
      setAiSpeaking(false);
      answerReadyAt.current = Date.now();
      // Give candidate 1.2s to read question, then immediately start listening!
      setTimeout(() => {
        if (beginRecordingRef.current) beginRecordingRef.current();
      }, 1200);
      return;
    }

    try {
      setAiSpeaking(true);
      const audio = new Audio(interviewApi.audioUrl(token, q.audio_file));
      aiAudioRef.current = audio;
      await audio.play();
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
    } catch {
      /* autoplay blocked */
    } finally {
      setAiSpeaking(false);
      answerReadyAt.current = Date.now();
      // Aria finished speaking: automatically start listening immediately!
      setTimeout(() => {
        if (beginRecordingRef.current) beginRecordingRef.current();
      }, 400);
    }
  }, [token, stopVadMonitoring]);

  const replayAudio = () => {
    if (question?.audio_file) {
      stopVadMonitoring();
      try {
        if (vRecRef.current?.state === 'recording') vRecRef.current.stop();
        if (aRecRef.current?.state === 'recording') aRecRef.current.stop();
      } catch {}
      setRecording(false);
      playQuestionAudio(question);
    }
  };

  // ---- submit turn ----
  const submitTurn = useCallback(async (answerText?: string) => {
    setProcessing(true);
    setTurnError('');
    try {
      const t2first = firstInteractionAt.current != null
        ? Math.max(0, firstInteractionAt.current - (answerReadyAt.current || firstInteractionAt.current))
        : undefined;
      const curQ = questionRef.current;
      const next: QuestionPayload = await interviewApi.turn(token, {
        video: pendingVideo.current || undefined,
        audio: pendingAudio.current || undefined,
        answerText,
        turnSeq: curQ?.question_number,
        durationSeconds: pendingDuration.current || undefined,
        focusLostCount: focusLost.current,
        focusLostMs: focusLostMs.current,
        pasteCount: pasteCount.current,
        fullscreenExits: fsExits.current,
        timeToFirstAnswerMs: t2first,
      });
      pendingVideo.current = null;
      pendingAudio.current = null;
      setProcessing(false);
      if (next.done) {
        await finishInterview();
        return;
      }
      setQuestion(next);
      resetSignals();
      playQuestionAudio(next);
    } catch (err: any) {
      setProcessing(false);
      if (err?.status === 410 || err?.status === 409) {
        setErrorMsg(err.message);
        setPhase('error');
      } else {
        setTurnError(err?.message || 'Network problem submitting your answer. Your recording is kept — please retry.');
      }
    }
  }, [token, resetSignals, playQuestionAudio]);

  const stopAndSubmit = useCallback(async () => {
    if (isSubmittingTurnRef.current) return;
    isSubmittingTurnRef.current = true;
    stopVadMonitoring();
    if (timerRef.current) clearInterval(timerRef.current);

    const finalize = (rec: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> =>
      new Promise((resolve) => {
        if (!rec || rec.state !== 'recording') {
          return resolve(chunks.length > 0 ? new Blob(chunks, { type: chunks[0]?.type || 'video/webm' }) : null);
        }
        const timeout = setTimeout(() => {
          resolve(chunks.length > 0 ? new Blob(chunks, { type: chunks[0]?.type || rec.mimeType || 'video/webm' }) : null);
        }, 1200);

        rec.onstop = () => {
          clearTimeout(timeout);
          resolve(new Blob(chunks, { type: chunks[0]?.type || rec.mimeType || 'video/webm' }));
        };
        try {
          rec.stop();
        } catch {
          clearTimeout(timeout);
          resolve(chunks.length > 0 ? new Blob(chunks) : null);
        }
      });

    const [vBlob, aBlob] = await Promise.all([
      finalize(vRecRef.current, vChunks.current),
      finalize(aRecRef.current, aChunks.current),
    ]);
    pendingVideo.current = vBlob;
    pendingAudio.current = aBlob;
    pendingDuration.current = recSeconds;
    setRecording(false);
    await submitTurn();
    isSubmittingTurnRef.current = false;
  }, [recSeconds, stopVadMonitoring, submitTurn]);

  stopAndSubmitRef.current = stopAndSubmit;

  const submitTextAnswer = async () => {
    if (!textAnswer.trim()) return;
    pendingVideo.current = null;
    pendingAudio.current = null;
    setShowTextModal(false);
    await submitTurn(textAnswer.trim());
    setTextAnswer('');
  };

  const retryTurn = async () => {
    await submitTurn(textAnswer.trim() || undefined);
  };

  const finishInterview = async () => {
    try {
      const res = await interviewApi.complete(token);
      setCompleteMessage(res?.message || 'Your interview is complete. Thank you for your time.');
    } catch {
      setCompleteMessage('Your interview has ended. Thank you for your time.');
    } finally {
      stopStream();
      setPhase('complete');
    }
  };

  const endInterviewEarly = () => {
    setShowEndConfirm(true);
  };

  const confirmEnd = async () => {
    setShowEndConfirm(false);
    await finishInterview();
  };

  // ---- email verification gate ----
  const verifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setVerifyBusy(true);
    setVerifyError('');
    try {
      await interviewApi.verifyEmail(token, emailInput.trim());
      setPhase('device-check');
    } catch (err: any) {
      setVerifyError(err?.message || 'Could not verify that email. Please try again.');
    } finally {
      setVerifyBusy(false);
    }
  };

  // ---- start / resume ----
  const startInterview = async () => {
    let ok = !!streamRef.current;
    if (!ok) ok = await requestMedia();
    try {
      setProcessing(true);
      setTurnError('');
      const q: QuestionPayload = await interviewApi.start(token);
      setProcessing(false);
      setPhase('interview');
      if (q.done) { await finishInterview(); return; }
      setQuestion(q);
      if (!ok) setUseTextFallback(true);
      resetSignals();
      playQuestionAudio(q);
    } catch (err: any) {
      setProcessing(false);
      if (err?.status === 410) { setErrorMsg(err.message); setPhase('error'); }
      else { setTurnError(err?.message || 'Could not start the interview. Please retry.'); }
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ================= render =================

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14] text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-white/60">Connecting to interview room…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#131720] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Interview Unavailable</h1>
          <p className="mt-3 text-sm text-white/70 leading-relaxed">{errorMsg}</p>
          <p className="mt-5 text-xs text-white/40">Please contact the recruiter or hiring team who provided this link.</p>
        </div>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#131720] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Interview Complete</h1>
          <p className="mt-3 text-sm text-white/80 leading-relaxed">{completeMessage}</p>
          <div className="mt-6 rounded-2xl bg-white/[0.04] p-4 text-xs text-white/60 border border-white/5">
            The hiring team has received your responses and performance evaluation. You may safely close this browser window.
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'verify') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-4 text-white">
        <form onSubmit={verifyEmail} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#131720] p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-bold text-xs text-white">H</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-400">Haira AI Interview</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{session?.job_title}</h1>
          <p className="mt-2 text-sm text-white/70">
            Hi {session?.candidate_first_name}, confirm your email address to enter the interview room.
          </p>
          <label htmlFor="verify-email" className="mt-6 block text-xs font-semibold uppercase tracking-wider text-white/60">Email address</label>
          <input
            id="verify-email" type="email" autoComplete="email" required autoFocus
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
          />
          {verifyError && <p className="mt-3 text-xs font-medium text-red-400">{verifyError}</p>}
          <button
            type="submit"
            disabled={verifyBusy || !emailInput.trim()}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:opacity-95 disabled:opacity-50 transition"
          >
            {verifyBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : 'Enter Interview Room'}
          </button>
          <p className="mt-4 text-[11px] text-white/40 text-center">
            This private link is protected and unique to your candidate profile.
          </p>
        </form>
      </div>
    );
  }

  if (phase === 'device-check') {
    const resuming = session?.status === 'in_progress';
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-4 sm:p-6 text-white">
        <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#131720] p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 font-bold text-xs text-white">H</span>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Haira AI · 1-on-1 Interview</span>
            </div>
            <span className="text-xs text-white/50">{session?.job_title}</span>
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {resuming ? `Welcome back, ${session?.candidate_first_name}` : `Ready for your interview, ${session?.candidate_first_name}?`}
          </h1>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            You will be speaking directly with <strong className="text-white">Aria</strong>, our AI interviewer. Aria will ask each question aloud, and the system will automatically listen as you speak your answer.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
            {/* Webcam preview */}
            <div>
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-inner">
                {media === 'granted' ? (
                  <video ref={videoElRef} autoPlay muted playsInline className="h-full w-full object-cover [transform:scaleX(-1)]" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-white/50">
                    <Video className="h-9 w-9 text-white/30" />
                    <span className="text-xs">Camera preview will appear here</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white/90 border border-white/10">
                  {session?.candidate_name || session?.candidate_first_name || 'Candidate'}
                </div>
              </div>
              {media !== 'granted' && (
                <button
                  onClick={requestMedia}
                  disabled={media === 'requesting'}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 text-sm font-semibold hover:bg-white/15 disabled:opacity-50 transition"
                >
                  {media === 'requesting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  Allow camera &amp; microphone
                </button>
              )}
            </div>

            {/* Checklist */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-white/70">Camera</span>
                {camOn ? <span className="flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> Active</span> : <span className="text-white/40">Waiting</span>}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-white/70">Microphone</span>
                {micOn ? <span className="flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> Active</span> : <span className="text-white/40">Waiting</span>}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-white/70">Speaker output</span>
                <span className="flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> Ready</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-white/70">Hands-free voice detection</span>
                <span className="flex items-center gap-1 text-emerald-400 font-semibold"><CheckCircle2 size={13} /> Enabled</span>
              </div>

              <div className="!mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-xs text-white/60 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-white/90">
                  <ShieldCheck size={14} className="text-blue-400" />
                  <span>Hands-free Conversation</span>
                </div>
                <p>• Speak directly into your microphone after Aria finishes asking.</p>
                <p>• When you finish speaking, your answer submits automatically after a brief pause (or click Done anytime).</p>
                <p>• Live subtitles let you read along with Aria in real-time.</p>
              </div>
            </div>
          </div>

          {turnError && <p className="mt-4 text-xs font-medium text-red-400">{turnError}</p>}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={startInterview}
              disabled={processing || media === 'requesting'}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:opacity-95 disabled:opacity-50 transition"
            >
              {processing || media === 'requesting' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Preparing Room…</>
              ) : (
                <><Video className="h-4 w-4" /> {resuming ? 'Resume Video Call' : 'Join Interview Call'}</>
              )}
            </button>
            {media !== 'granted' && (
              <button
                onClick={() => { setUseTextFallback(true); startInterview(); }}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-xs font-semibold hover:bg-white/10 text-white/80"
              >
                <Keyboard className="h-4 w-4" /> Text-answer mode
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ======================================================================
  // 1-on-1 LIVE VIDEO INTERVIEW ROOM (HAIRA AI LAYOUT - HANDS-FREE)
  // ======================================================================
  const qNum = question?.question_number || 1;
  const qTotal = question?.total_questions || session?.total_questions || 1;
  const candidateName = session?.candidate_name || session?.candidate_first_name || 'Candidate';
  const mmss = formatTimer(recSeconds);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#0b0e14] text-white select-none overflow-hidden font-sans">
      
      {/* 1. TOP HEADER: BRANDING & CALL TIMER */}
      <header className="relative z-20 flex items-center justify-between px-6 pt-5 pb-2">
        {/* Left Branding Badge */}
        <div className="flex items-center gap-2.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 px-4 py-1.5 shadow-xl">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-extrabold text-xs text-white shadow-inner">
            H
          </div>
          <span className="font-semibold text-xs tracking-wide text-white">Haira AI</span>
          <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
          </div>
          <div className="flex items-center gap-1 text-white/70 font-mono text-xs pl-1">
            <Timer className="h-3 w-3 text-white/40" />
            <span>{formatTimer(callElapsed)}</span>
          </div>
        </div>

        {/* Center / Right: Question Progress Badge */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/[0.06] backdrop-blur-md px-3.5 py-1.5 border border-white/10 text-xs text-white/70">
            <span className="font-semibold text-white">{session?.job_title}</span>
            <span className="text-white/30">•</span>
            <span className="text-blue-400 font-semibold">Question {qNum} of {qTotal}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-medium hidden sm:inline">Connected</span>
          </div>
        </div>
      </header>

      {/* 2. MAIN STAGE: SPLIT-SCREEN 1-ON-1 TILES */}
      <main className="relative z-10 flex-1 w-full max-w-[1550px] mx-auto px-4 sm:px-6 py-2 min-h-0 flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 h-full max-h-[76vh] w-full">
          
          {/* LEFT TILE: CANDIDATE WEBCAM */}
          <div className="relative h-full w-full rounded-3xl overflow-hidden bg-[#131720] border border-white/10 shadow-2xl flex items-center justify-center">
            {camOn && !useTextFallback ? (
              <video
                ref={videoElRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover [transform:scaleX(-1)]"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-white/40">
                <div className="h-20 w-20 rounded-full bg-white/[0.07] border border-white/10 flex items-center justify-center text-2xl font-bold text-white/80">
                  {candidateName[0]?.toUpperCase() || 'C'}
                </div>
                <p className="text-xs font-medium text-white/60">Camera is off</p>
              </div>
            )}

            {/* Candidate Bottom-Left Name Badge */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white border border-white/10 shadow-lg">
              <span className={`h-2 w-2 rounded-full ${micOn ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span>{candidateName}</span>
            </div>

            {/* Real-time Voice Detection Activity Badge */}
            {recording && (
              <div className={`absolute top-4 left-4 flex items-center gap-2 rounded-full backdrop-blur-md px-3.5 py-1.5 text-xs font-bold text-white shadow-lg border transition-all ${
                isCandidateSpeaking
                  ? 'bg-emerald-600/90 border-emerald-400/50 scale-105'
                  : 'bg-blue-600/80 border-blue-400/40'
              }`}>
                <span className={`h-2 w-2 rounded-full bg-white ${isCandidateSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
                <span>{isCandidateSpeaking ? 'SPEAKING' : 'LISTENING'} ({mmss})</span>
                {autoSubmitCountdown != null && (
                  <span className="ml-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-mono font-medium">
                    Submitting in {autoSubmitCountdown}s…
                  </span>
                )}
              </div>
            )}
          </div>

          {/* RIGHT TILE: AI INTERVIEWER ("ARIA") */}
          <div className={`relative h-full w-full rounded-3xl overflow-hidden bg-[#131720] border ${
            aiSpeaking ? 'border-blue-500/60 shadow-[0_0_40px_rgba(59,130,246,0.25)]' : 'border-white/10'
          } shadow-2xl transition-all duration-500 flex items-center justify-center`}>
            
            <img
              src="/avatars/aria.jpg"
              alt="Aria - AI Interviewer"
              className={`h-full w-full object-cover transition-transform duration-700 ${aiSpeaking ? 'scale-[1.02]' : 'scale-100'}`}
            />

            {/* Speaking equalizer glow overlay */}
            {aiSpeaking && (
              <div className="absolute inset-0 bg-gradient-to-t from-blue-950/40 via-transparent to-transparent pointer-events-none" />
            )}

            {/* Aria Bottom-Left Name Badge */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white border border-white/10 shadow-lg">
              <span className={`h-2 w-2 rounded-full transition-colors ${aiSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-blue-400'}`} />
              <span>Aria</span>
              {aiSpeaking ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-300 font-medium pl-1">
                  <Volume2 size={12} className="animate-pulse" /> Asking Question…
                </span>
              ) : (
                <span className="text-[11px] text-white/50 pl-1">Interviewer</span>
              )}
            </div>

            {/* Live Question Subtitles / Closed Captions */}
            {showSubtitles && question?.question_text && (
              <div className="absolute bottom-16 inset-x-4 sm:inset-x-6 max-w-xl mx-auto rounded-2xl bg-black/80 backdrop-blur-xl border border-white/15 p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={11} /> {question.is_followup ? 'Follow-up Question' : `Question ${qNum} of ${qTotal}`}
                  </span>
                  <button onClick={() => setShowSubtitles(false)} className="text-white/40 hover:text-white text-xs">✕</button>
                </div>
                <p className="text-sm font-medium leading-relaxed text-white drop-shadow">
                  "{question.question_text}"
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* 3. FLOATING BOTTOM CONTROL DOCK (HAIRA AI STYLE - HANDS-FREE DIRECT ANSWERING) */}
      <footer className="relative z-30 pb-5 pt-2 flex flex-col items-center gap-2">
        {/* Error message banner */}
        {turnError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-1.5 text-xs font-medium text-red-200 backdrop-blur-md">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span>{turnError}</span>
            <button onClick={retryTurn} className="ml-2 underline font-bold hover:text-white">Retry</button>
          </div>
        )}

        {/* Floating pill dock */}
        <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-[#181c24]/95 backdrop-blur-2xl border border-white/15 px-3.5 sm:px-5 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.6)]">
          
          {/* Microphone Toggle */}
          <button
            onClick={toggleMic}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              micOn ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-red-500/25 text-red-300 border border-red-500/30'
            }`}
            title="Toggle Microphone"
          >
            {micOn ? <Mic size={15} /> : <MicOff size={15} />}
            <span className="hidden sm:inline">Microphone</span>
            <ChevronDown size={13} className="text-white/40" />
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleCam}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              camOn ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-red-500/25 text-red-300 border border-red-500/30'
            }`}
            title="Toggle Camera"
          >
            {camOn ? <Video size={15} /> : <VideoOff size={15} />}
            <span className="hidden sm:inline">Camera</span>
            <ChevronDown size={13} className="text-white/40" />
          </button>

          <div className="h-5 w-[1px] bg-white/15 mx-1" />

          {/* Dynamic Conversational Action Button */}
          {aiSpeaking ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-500/30 px-5 py-2 text-xs font-semibold text-blue-300 animate-pulse">
              <Volume2 size={15} />
              <span>Aria is speaking…</span>
            </div>
          ) : processing ? (
            <div className="flex items-center gap-2 rounded-full bg-blue-500/20 border border-blue-500/30 px-5 py-2 text-xs font-semibold text-blue-300">
              <Loader2 size={15} className="animate-spin text-blue-400" />
              <span>Submitting answer & preparing next question…</span>
            </div>
          ) : recording ? (
            <button
              onClick={stopAndSubmit}
              className={`flex items-center gap-2 rounded-full text-white px-5 py-2.5 text-xs font-bold transition shadow-lg ${
                autoSubmitCountdown != null
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/40 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/40'
              }`}
              title="Click when you are done speaking to immediately move to the next question"
            >
              <Square size={13} className="fill-white" />
              <span>
                {autoSubmitCountdown != null
                  ? `Submitting in ${autoSubmitCountdown}s · Click to Submit Now`
                  : `Finish Answer & Next → (${mmss})`}
              </span>
            </button>
          ) : (
            <button
              onClick={beginRecording}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2 text-xs font-bold transition shadow-lg shadow-blue-600/30"
            >
              <Mic size={15} />
              <span>Start Speaking</span>
            </button>
          )}

          {/* Subtitles Toggle Button */}
          <button
            onClick={() => setShowSubtitles((s) => !s)}
            title="Toggle Question Subtitles"
            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
              showSubtitles ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40 hover:text-white'
            }`}
          >
            <Subtitles size={14} />
          </button>

          {/* Replay Aria Audio */}
          {question?.audio_file && !aiSpeaking && (
            <button
              onClick={replayAudio}
              title="Replay Aria Question Audio"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              <Play size={12} className="fill-white" />
            </button>
          )}

          {/* Typed answer fallback */}
          <button
            onClick={() => setShowTextModal(true)}
            title="Type answer instead"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <Keyboard size={14} />
          </button>

          <div className="h-5 w-[1px] bg-white/15 mx-1" />

          {/* End Interview Button */}
          <button
            onClick={endInterviewEarly}
            className="flex items-center gap-1.5 rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white px-4 py-2 text-xs font-bold transition shadow-lg shadow-red-500/30"
          >
            <PhoneOff size={13} />
            <span>End Interview</span>
          </button>

        </div>
      </footer>

      {/* MODAL: TYPE ANSWER FALLBACK */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#161a23] p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white">Type Your Answer</h2>
            <p className="mt-1 text-xs text-white/60">
              For question {qNum}: "{question?.question_text}"
            </p>
            <textarea
              value={textAnswer}
              onChange={(e) => { markFirstInteraction(); setTextAnswer(e.target.value); }}
              placeholder="Type your response thoroughly here…"
              rows={5}
              className="mt-4 w-full rounded-2xl border border-white/15 bg-white/[0.04] p-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowTextModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={submitTextAnswer}
                disabled={!textAnswer.trim() || processing}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition"
              >
                {processing ? <Loader2 size={13} className="animate-spin" /> : null}
                Submit Text Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM END INTERVIEW */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#161a23] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-lg font-bold text-white">End Interview Early?</h2>
            <p className="mt-2 text-xs text-white/70 leading-relaxed">
              You are currently on question {qNum} of {qTotal}. If you end now, the recruiter will evaluate your responses up to this point and you cannot re-enter.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 rounded-2xl border border-white/15 bg-white/[0.05] py-2.5 text-xs font-bold text-white hover:bg-white/10"
              >
                Keep Going
              </button>
              <button
                onClick={confirmEnd}
                className="flex-1 rounded-2xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-500 shadow-lg shadow-red-600/30"
              >
                Yes, End Interview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
