import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RecStatus = "idle" | "recording" | "paused" | "stopped";

/** Microphone recorder + level analysis + live speech recognition (where the browser supports it). */
export function useRecorder(onFinalText: (t: string) => void) {
  const [status, setStatus] = useState<RecStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [speaking, setSpeaking] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [srError, setSrError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const SR: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const srSupported = !!SR;

  const statusRef = useRef<RecStatus>("idle");
  const secondsRef = useRef(0); const speakingRef = useRef(0); const lastTick = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const freqBuf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeBuf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const sr = useRef<any>(null);
  const tick = useRef<number | undefined>(undefined);
  const finalCb = useRef(onFinalText); finalCb.current = onFinalText;
  const urlRef = useRef<string | null>(null);

  const setSt = (s: RecStatus) => { statusRef.current = s; setStatus(s); };

  const stopSR = useCallback(() => {
    const r = sr.current; sr.current = null;
    if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.stop(); } catch { /* ignore */ } }
    setInterim("");
  }, []);

  const startSR = useCallback(() => {
    if (!SR || sr.current) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    r.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) { const t = String(res[0].transcript || "").trim(); if (t) finalCb.current(t); }
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setSrError("Speech recognition permission was denied. Type or paste your transcript below.");
      else if (e.error === "network") setSrError("Speech recognition needs a network connection in this browser. You can type the transcript manually.");
    };
    r.onend = () => { sr.current = null; if (statusRef.current === "recording") { try { startSR(); } catch { /* ignore */ } } };
    sr.current = r;
    try { r.start(); } catch { sr.current = null; }
  }, [SR]);

  const teardownAudio = useCallback(() => {
    window.clearInterval(tick.current);
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    void ctx.current?.close().catch(() => {}); ctx.current = null; analyser.current = null;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current === "paused") {
      try { recorder.current?.resume(); } catch { /* ignore */ }
      lastTick.current = performance.now(); setSt("recording"); startSR(); return true;
    }
    setMicError(null); setSrError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const c: AudioContext = new AC(); ctx.current = c;
      const a = c.createAnalyser(); a.fftSize = 512; a.smoothingTimeConstant = 0.75;
      c.createMediaStreamSource(s).connect(a);
      analyser.current = a; freqBuf.current = new Uint8Array(a.frequencyBinCount); timeBuf.current = new Uint8Array(a.fftSize);
      chunks.current = [];
      if (typeof MediaRecorder !== "undefined") {
        const mr = new MediaRecorder(s);
        mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        mr.onstop = () => {
          if (!chunks.current.length) return;
          const url = URL.createObjectURL(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url; setAudioUrl(url);
        };
        mr.start(1000); recorder.current = mr;
      }
      secondsRef.current = 0; speakingRef.current = 0; setSeconds(0); setSpeaking(0);
      lastTick.current = performance.now(); setSt("recording");
      tick.current = window.setInterval(() => {
        const now = performance.now(); const dt = (now - lastTick.current) / 1000; lastTick.current = now;
        if (statusRef.current !== "recording") return;
        secondsRef.current += dt;
        const an = analyser.current, tb = timeBuf.current;
        if (an && tb) {
          an.getByteTimeDomainData(tb);
          let sum = 0; for (let i = 0; i < tb.length; i++) { const v = (tb[i] - 128) / 128; sum += v * v; }
          if (Math.sqrt(sum / tb.length) > 0.03) speakingRef.current += dt;
        }
        setSeconds(secondsRef.current); setSpeaking(speakingRef.current);
      }, 200);
      startSR();
      return true;
    } catch (e) {
      teardownAudio(); setSt("idle");
      const name = (e as Error).name;
      setMicError(name === "NotAllowedError" || name === "SecurityError" ? "Microphone access was denied. Allow it in your browser, or type your transcript manually below."
        : name === "NotFoundError" ? "No microphone was found. Type your transcript manually below." : "Could not start the microphone. Type your transcript manually below.");
      return false;
    }
  }, [startSR, teardownAudio]);

  const pause = useCallback(() => {
    if (statusRef.current !== "recording") return;
    try { recorder.current?.pause(); } catch { /* ignore */ }
    setSt("paused"); stopSR();
  }, [stopSR]);

  const stop = useCallback(() => {
    if (statusRef.current !== "recording" && statusRef.current !== "paused") return;
    setSt("stopped"); stopSR();
    try { if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); } catch { /* ignore */ }
    recorder.current = null; teardownAudio();
    setSeconds(secondsRef.current); setSpeaking(speakingRef.current);
  }, [stopSR, teardownAudio]);

  const discard = useCallback(() => {
    stopSR();
    try { if (recorder.current && recorder.current.state !== "inactive") { recorder.current.onstop = null; recorder.current.stop(); } } catch { /* ignore */ }
    recorder.current = null; chunks.current = []; teardownAudio();
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setAudioUrl(null); secondsRef.current = 0; speakingRef.current = 0; setSeconds(0); setSpeaking(0); setSt("idle");
  }, [stopSR, teardownAudio]);

  const getFreq = useCallback((): Uint8Array<ArrayBuffer> | null => {
    const a = analyser.current, b = freqBuf.current;
    if (!a || !b) return null;
    a.getByteFrequencyData(b); return b;
  }, []);

  useEffect(() => () => {
    stopSR(); try { recorder.current?.stop(); } catch { /* ignore */ }
    teardownAudio(); if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, [stopSR, teardownAudio]);

  return { status, seconds, speaking, audioUrl, micError, srError, interim, srSupported, start, pause, stop, discard, getFreq };
}
