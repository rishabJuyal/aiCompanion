import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Send,
  X,
  Loader2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Crosshair,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import "./loupe-app-styles.css";

/* ------------------------------------------------------------------ */
/*  Loupe — a floating, screen-reading coding tutor.                   */
/*                                                                      */
/*  Flow: capture the screen -> Loupe tags 4-7 things it can see ->     */
/*  pick a tag -> Loupe explains it in plain language -> keep asking.   */
/*                                                                      */
/*  Real browser APIs used (Chrome / Edge desktop):                     */
/*   - Document Picture-in-Picture, to float the panel over any window  */
/*   - getDisplayMedia, to grab a single frame of the screen             */
/* ------------------------------------------------------------------ */

const MODEL = "gemini-3.6-flash";
const STORAGE_KEY = "loupe_api_key";

const TAG_SYSTEM_PROMPT =
  "You are Loupe, a screen-reading assistant inside a coding-tutor app. " +
  "Look at the screenshot and list 4 to 7 distinct, concrete things visible " +
  "on it that a learner might want explained — UI elements, code, error " +
  "messages, panels, icons, output, anything. Respond with ONLY a raw JSON " +
  'array, no markdown fences, no preamble, no trailing text. Each item: ' +
  '{"label": short name (max 6 words), "hint": one short phrase on where it is}.';

const EXPLAIN_SYSTEM_PROMPT =
  "You are Loupe, a sharp, friendly coding tutor living inside a floating " +
  "desktop companion. You can see the screenshot the learner captured. " +
  "Explain things briefly and clearly, like teaching a smart beginner: what " +
  "it is, why it's there, and a tiny code example if it genuinely helps. " +
  "Keep answers tight — a few short paragraphs at most. Never claim you " +
  "can't see the screenshot.";

export const MODEL_OPTIONS = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (recommended)" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-omni-flash", label: "Gemini Omni Flash (video-gen model, not for this flow)" },
  { id: "gemini-3.1-flash-tts", label: "Gemini 3.1 Flash TTS (speech model, not for this flow)" },
  { id: "gemini-2.5-flash-tts", label: "Gemini 2.5 Flash TTS (speech model, not for this flow)" },
  { id: "gemini-embedding-1", label: "Gemini Embedding 1 (embeddings, not for this flow)" },
  { id: "gemini-embedding-2", label: "Gemini Embedding 2 (embeddings, not for this flow)" },
  { id: "gemini-robotics-er-1.5-preview", label: "Gemini Robotics ER 1.5 Preview (robotics, not for this flow)" },
  { id: "gemini-robotics-er-1.6-preview", label: "Gemini Robotics ER 1.6 Preview (robotics, not for this flow)" },
  { id: "gemini-robotics-er-2-preview", label: "Gemini Robotics ER 2 Preview (robotics, not for this flow)" },
];

async function callGemini(apiKey, model, system, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages,
      generationConfig: { maxOutputTokens: 1000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const blockReason = data.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Blocked by the model: ${blockReason}` : "No response from the model.");
  }
  return (candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function imagePartFromDataUrl(dataUrl) {
  const mimeType = (dataUrl.match(/data:(image\/[a-zA-Z]+);/) || [])[1] || "image/png";
  const data = dataUrl.split(",")[1] || "";
  return { inlineData: { mimeType, data } };
}

/* -------------------------- visual pieces -------------------------- */

function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-md pointer-events-none">
      <div
        className="absolute left-0 right-0 h-8 bg-amber-400/25 animate-loupe-scan"
        style={{
          top: "-2rem",
          boxShadow: "0 0 12px 2px rgba(251,191,36,0.35)",
        }}
      />
    </div>
  );
}

function Eyebrow({ children, className = "" }) {
  return (
    <div className={"font-mono text-xs uppercase tracking-widest text-slate-500 " + className}>
      {children}
    </div>
  );
}

/* -------------------------- the panel itself ------------------------ */

function CompanionPanel({
  isPiP,
  onPopOut,
  onDockBack,
  pipSupported,
  stage,
  error,
  screenshot,
  options,
  busy,
  messages,
  promptText,
  setPromptText,
  onCapture,
  onRetake,
  onChooseOption,
  onSend,
  onReset,
  chatEndRef,
  hasApiKey,
}) {
  const hasSession = !!screenshot;

  return (
    <div className="flex flex-col w-full h-full text-slate-100" style={{ background: "#0b1220" }}>
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full border border-amber-400/60 text-amber-400">
            <Crosshair size={14} strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-mono text-sm tracking-widest text-slate-100 leading-none">LOUPE</div>
            <div className="font-mono text-xs tracking-widest text-slate-500 leading-none mt-0.5">
              SCREEN FIELD NOTES
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {hasSession && (
            <button
              onClick={onReset}
              title="Clear this session"
              aria-label="Clear session"
              className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          )}
          {pipSupported && !isPiP && (
            <button
              onClick={onPopOut}
              title="Pop out onto the desktop"
              aria-label="Pop out onto the desktop"
              className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors"
            >
              <Maximize2 size={15} />
            </button>
          )}
          {isPiP && (
            <button
              onClick={onDockBack}
              title="Dock back into the page"
              aria-label="Dock back into the page"
              className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors"
            >
              <Minimize2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 loupe-scrollbar">
        {!hasApiKey && (
          <div className="flex items-start gap-2 rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
            <KeyRound size={15} className="mt-0.5 shrink-0" />
            <span>Add your Gemini API key on the left before capturing.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!hasSession && stage === "idle" && (
          <div className="flex flex-col items-center text-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-slate-600">
              <Crosshair size={22} />
            </div>
            <div>
              <div className="text-slate-200 font-medium">Point it at anything.</div>
              <div className="text-slate-500 text-sm mt-1 max-w-[15rem]">
                Capture your screen and Loupe tags what's on it. Pick a tag to get a
                plain-English explainer.
              </div>
            </div>
          </div>
        )}

        {(stage === "capturing" || stage === "analyzing") && (
          <div className="space-y-2">
            <div className="relative w-full h-28 rounded-md border border-slate-800 bg-slate-900 overflow-hidden">
              {screenshot && (
                <img src={screenshot} alt="Captured screen" className="w-full h-full object-cover opacity-60" />
              )}
              <ScanLine />
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-sm font-mono">
              <Loader2 size={14} className="animate-spin" />
              {stage === "capturing" ? "Reading the screen…" : "Scanning for things to explain…"}
            </div>
          </div>
        )}

        {hasSession && stage !== "capturing" && stage !== "analyzing" && (
          <>
            <div className="relative w-full h-20 rounded-md border border-slate-800 overflow-hidden">
              <img src={screenshot} alt="Captured screen" className="w-full h-full object-cover" />
            </div>

            {options.length > 0 && (
              <div className="space-y-2">
                <Eyebrow>What should Loupe explain?</Eyebrow>
                <div className="space-y-1.5">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => onChooseOption(opt)}
                      disabled={busy}
                      className="w-full flex items-start gap-2 text-left rounded-md border border-slate-800 hover:border-amber-400/60 bg-slate-900/60 hover:bg-slate-900 px-2.5 py-2 transition-colors disabled:opacity-40"
                    >
                      <span className="font-mono text-xs text-amber-400 border border-amber-400/40 rounded px-1 py-0.5 mt-0.5 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="block text-sm text-slate-100 leading-tight">{opt.label}</span>
                        {opt.hint && (
                          <span className="block text-xs text-slate-500 leading-tight mt-0.5">{opt.hint}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onRetake}
              className="text-xs font-mono uppercase tracking-wide text-slate-500 hover:text-amber-400 transition-colors"
            >
              Capture again
            </button>
          </>
        )}

        {messages.length > 0 && (
          <div className="space-y-2 pt-1">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                <span className="font-mono text-xs tracking-widest text-slate-600 mb-0.5">
                  {m.role === "user" ? "YOU" : "LOUPE"}
                </span>
                <div
                  className={
                    "max-w-[92%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap " +
                    (m.role === "user"
                      ? "bg-amber-400/10 border border-amber-400/30 text-amber-100"
                      : "bg-slate-800/70 border border-slate-700 text-slate-100")
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-slate-400 text-sm font-mono">
                <Loader2 size={14} className="animate-spin" />
                Writing the explainer…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* input bar */}
      <div className="border-t border-slate-800 p-2 shrink-0">
        <div className="flex items-end gap-1.5">
          {!hasSession ? (
            <button
              onClick={onCapture}
              disabled={busy || stage === "capturing" || stage === "analyzing" || !hasApiKey}
              className="flex items-center gap-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-medium text-sm px-3 py-2 transition-colors disabled:opacity-50 shrink-0"
            >
              <Camera size={15} />
              Capture screen
            </button>
          ) : null}

          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={
              !hasSession
                ? "Optional — tell Loupe what to focus on before capturing"
                : options.length > 0
                ? "Or type what you want explained…"
                : "Ask a follow-up…"
            }
            rows={1}
            className="flex-1 resize-none rounded-md bg-slate-900 border border-slate-800 focus:border-amber-400/60 focus:outline-none text-sm text-slate-100 placeholder-slate-500 px-2.5 py-2 max-h-20"
          />

          <button
            onClick={onSend}
            disabled={busy || !promptText.trim() || !hasApiKey}
            aria-label="Send"
            title="Send"
            className="p-2 rounded-md text-slate-950 bg-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- api key bar ---------------------------- */

export function ApiKeyBar({ apiKey, setApiKey, modelId, setModelId }) {
  const [draft, setDraft] = useState(apiKey);
  const [open, setOpen] = useState(!apiKey);
  const saved = !!apiKey;
  const looksLikeApiKey = /^AIza/.test(draft.trim());

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound size={15} className={saved ? "text-amber-400" : "text-slate-500"} />
          <span className="text-slate-300">{saved ? "Gemini API key added" : "Add your Gemini API key"}</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-mono uppercase tracking-wide text-slate-500 hover:text-amber-400 transition-colors"
        >
          {open ? "Hide" : saved ? "Change" : "Add"}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="AIzaSy…"
            className="w-full rounded-md bg-slate-950 border border-slate-800 focus:border-amber-400/60 focus:outline-none text-sm text-slate-100 placeholder-slate-500 px-2.5 py-2"
          />
          {draft.trim() && !looksLikeApiKey && (
            <p className="text-xs text-amber-400/90 leading-relaxed">
              That doesn't look like a Gemini API key (those start with "AIzaSy"). It
              may be an OAuth token instead, which won't work with this endpoint and
              tends to expire quickly — grab a proper key from the link below.
            </p>
          )}

          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-md bg-slate-950 border border-slate-800 focus:border-amber-400/60 focus:outline-none text-sm text-slate-100 px-2.5 py-2"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-between">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-500 hover:text-amber-400 underline"
            >
              Get a key at aistudio.google.com
            </a>
            <button
              onClick={() => {
                setApiKey(draft.trim());
                setOpen(false);
              }}
              className="rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-medium px-2.5 py-1.5 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Stored only in this browser's local storage and sent directly to Google's
            Gemini API from your machine. Fine for personal, local use — don't ship a
            public site this way, since the key would be visible to anyone using it.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ main component -------------------------------- */

export default function LoupeApp() {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [modelId, setModelId] = useState(MODEL);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipSupported, setPipSupported] = useState(true);
  const [stage, setStage] = useState("idle"); // idle | capturing | analyzing | ready
  const [error, setError] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [promptText, setPromptText] = useState("");

  const apiMessagesRef = useRef([]);
  const chatEndRef = useRef(null);
  const pipContainerRef = useRef(null);

  const setApiKey = useCallback((key) => {
    setApiKeyState(key);
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    setPipSupported(typeof window !== "undefined" && "documentPictureInPicture" in window);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const cloneStylesInto = (targetDoc) => {
    try {
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        targetDoc.head.appendChild(node.cloneNode(true));
      });
    } catch (_) {
      /* non-fatal */
    }
  };

  const openPiP = useCallback(async () => {
    if (!("documentPictureInPicture" in window)) {
      setError("Pop-out isn't supported in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 400, height: 620 });
      cloneStylesInto(pip.document);
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#0b1220";
      pip.document.title = "Loupe";

      const container = pip.document.createElement("div");
      container.style.width = "100%";
      container.style.height = "100%";
      pip.document.body.appendChild(container);
      pipContainerRef.current = container;

      pip.addEventListener("pagehide", () => {
        setPipWindow(null);
        pipContainerRef.current = null;
      });

      setError("");
      setPipWindow(pip);
    } catch (err) {
      setError("Couldn't open the floating window: " + err.message);
    }
  }, []);

  const closePiP = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
    pipContainerRef.current = null;
  }, [pipWindow]);

  const resetSession = useCallback(() => {
    setStage("idle");
    setScreenshot(null);
    setOptions([]);
    setMessages([]);
    setError("");
    setPromptText("");
    apiMessagesRef.current = [];
  }, []);

  const captureScreen = useCallback(async () => {
    setError("");
    if (!apiKey) {
      setError("Add your Gemini API key first.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen capture isn't available here. Open this app in Chrome or Edge on desktop.");
      return;
    }
    setStage("capturing");
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" } });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 200));

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      track.stop();
      setScreenshot(dataUrl);
      setOptions([]);
      setMessages([]);
      apiMessagesRef.current = [];

      await analyzeScreenshot(dataUrl);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      setError(
        err.name === "NotAllowedError"
          ? "Loupe needs permission to capture the screen to work."
          : "Couldn't capture the screen: " + err.message
      );
      setStage("idle");
    }
  }, [apiKey]);

  const analyzeScreenshot = useCallback(
    async (dataUrl) => {
      setStage("analyzing");
      try {
        const text = await callGemini(apiKey, modelId, TAG_SYSTEM_PROMPT, [
          {
            role: "user",
            parts: [imagePartFromDataUrl(dataUrl), { text: "List the observable things on this screen." }],
          },
        ]);
        const clean = text.replace(/```json|```/g, "").trim();
        let parsed = [];
        try {
          parsed = JSON.parse(clean);
          if (!Array.isArray(parsed)) parsed = [];
        } catch (_) {
          parsed = [];
        }
        setOptions(parsed);
        if (parsed.length === 0) {
          setError("Loupe couldn't tag the screen automatically — type what you want explained below.");
        }
        setStage("ready");
      } catch (err) {
        setError("Analysis failed: " + err.message);
        setStage("ready");
      }
    },
    [apiKey, modelId]
  );

  const askLoupe = useCallback(
    async (userFacingLabel, requestText, includeImage) => {
      if (!apiKey) {
        setError("Add your Gemini API key first.");
        return;
      }
      setBusy(true);
      setError("");
      const parts = [];
      if (includeImage && screenshot) parts.push(imagePartFromDataUrl(screenshot));
      parts.push({ text: requestText });

      const nextApiMessages = [...apiMessagesRef.current, { role: "user", parts }];
      setMessages((prev) => [...prev, { role: "user", text: userFacingLabel }]);

      try {
        const reply = await callGemini(apiKey, modelId, EXPLAIN_SYSTEM_PROMPT, nextApiMessages);
        apiMessagesRef.current = [...nextApiMessages, { role: "model", parts: [{ text: reply }] }];
        setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      } catch (err) {
        setError("Loupe couldn't answer that: " + err.message);
      } finally {
        setBusy(false);
      }
    },
    [screenshot, apiKey, modelId]
  );

  const onChooseOption = useCallback(
    (option) => {
      const extra = promptText.trim();
      const requestText =
        `Explain "${option.label}" (${option.hint || "seen in the screenshot"}). ` +
        `Teach it like a quick, clear coding lesson: what it is, why it's there, and a tiny example if relevant.` +
        (extra ? ` Also take this into account: ${extra}` : "");
      const isFirstTurn = apiMessagesRef.current.length === 0;
      askLoupe(option.label + (extra ? " — " + extra : ""), requestText, isFirstTurn);
      setPromptText("");
    },
    [askLoupe, promptText]
  );

  const onSend = useCallback(() => {
    const text = promptText.trim();
    if (!text) return;
    const isFirstTurn = apiMessagesRef.current.length === 0;
    askLoupe(text, text, isFirstTurn && !!screenshot);
    setPromptText("");
  }, [askLoupe, promptText, screenshot]);

  const panelProps = {
    onPopOut: openPiP,
    onDockBack: closePiP,
    pipSupported,
    stage,
    error,
    screenshot,
    options,
    busy,
    messages,
    promptText,
    setPromptText,
    onCapture: captureScreen,
    onRetake: captureScreen,
    onChooseOption,
    onSend,
    onReset: resetSession,
    chatEndRef,
    hasApiKey: !!apiKey,
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-3xl grid md:grid-cols-2 gap-8 items-center">
        {/* hero / instructions */}
        <div className="text-slate-100 space-y-5">
          <div className="flex items-center gap-2 text-amber-400">
            <Crosshair size={18} />
            <span className="font-mono text-xs uppercase tracking-widest">Screen field notes</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Loupe explains whatever
            <br />
            you're looking at.
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
            Capture your screen, pick one of the tags Loupe finds on it, and get a
            plain-English explainer — built for learning code fast without leaving
            what you're working on.
          </p>

          <ApiKeyBar apiKey={apiKey} setApiKey={setApiKey} modelId={modelId} setModelId={setModelId} />

          <ol className="space-y-2.5 text-sm">
            {[
              "Capture the screen",
              "Pick what to explain from Loupe's tags",
              "Read the explainer, ask follow-ups, keep going",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="font-mono text-xs text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-slate-300">{step}</span>
              </li>
            ))}
          </ol>

          {pipSupported ? (
            <p className="text-slate-500 text-xs">
              Pop it out to keep Loupe floating over any window on your desktop, the way
              a video call's picture-in-picture does.
            </p>
          ) : (
            <p className="text-slate-500 text-xs">
              This browser doesn't support the floating window — Loupe stays docked in
              the page instead. Chrome or Edge on desktop supports popping it out.
            </p>
          )}
        </div>

        {/* the panel */}
        <div className="flex justify-center">
          {pipWindow ? (
            <div
              className="w-96 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-center gap-3 p-8"
              style={{ height: 560 }}
            >
              <div className="w-10 h-10 rounded-full border border-amber-400/50 flex items-center justify-center text-amber-400">
                <Crosshair size={18} />
              </div>
              <div className="text-slate-300 text-sm">Loupe is floating over your desktop.</div>
              <button
                onClick={closePiP}
                className="text-xs font-mono uppercase tracking-wide text-amber-400 hover:text-amber-300 transition-colors"
              >
                Dock it back here
              </button>
            </div>
          ) : (
            <div className="w-96 rounded-lg border border-slate-800 overflow-hidden shadow-2xl" style={{ height: 560 }}>
              <CompanionPanel isPiP={false} {...panelProps} />
            </div>
          )}
        </div>
      </div>

      {pipWindow &&
        pipContainerRef.current &&
        createPortal(<CompanionPanel isPiP={true} {...panelProps} />, pipContainerRef.current)}
    </div>
  );
}
