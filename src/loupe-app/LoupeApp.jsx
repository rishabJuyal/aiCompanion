import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  Sparkles,
  Eye,
  ZoomIn,
  ZoomOut,
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
  '{"label": short name (max 6 words), "hint": location phrase, "box_2d": [ymin, xmin, ymax, xmax] normalized 0 to 1000}.';

const EXPLAIN_SYSTEM_PROMPT =
  "You are Loupe, a sharp, friendly coding tutor living inside a floating " +
  "desktop companion. You can see the screenshot the learner captured. " +
  "Explain things clearly and scanably for fast understanding. Rules:\n" +
  "- Start with a one-line TL;DR in bold.\n" +
  "- Use short paragraphs (2-3 sentences max each).\n" +
  "- Use **bold** for key terms and concepts the first time they appear.\n" +
  "- Use `backticks` for any code, file names, commands, or technical identifiers.\n" +
  "- Use bullet points (- item) when listing multiple related things.\n" +
  "- Use numbered lists (1. step) only for sequential steps.\n" +
  "- Include a tiny fenced code example (```lang ... ```) only when it genuinely helps.\n" +
  "- Keep the whole answer compact — a learner should absorb it in under 30 seconds.\n" +
  "- Never claim you can't see the screenshot.";

const CLARIFY_SYSTEM_PROMPT =
  "You are Loupe, a screen-reading coding tutor. The learner selected something from " +
  "a screenshot and wants it explained. Your job is to decide: is the selection specific " +
  "enough to give a focused, useful answer, or is it too broad/ambiguous?\n\n" +
  "Rules:\n" +
  "- If the selection is clear and specific enough, respond with a JSON object:\n" +
  '  {\"action\": \"explain\", \"answer\": \"...your full markdown explanation...\"}\n' +
  "- If the selection is ambiguous or covers multiple things, respond with:\n" +
  '  {\"action\": \"clarify\", \"question\": \"What specifically about [X]?\", \"options\": [\"Option A\", \"Option B\", \"Option C\"]}\n' +
  "- Provide 2-4 short, distinct options that cover the most likely things the learner means.\n" +
  "- The question should be brief and conversational.\n" +
  "- If the learner has already answered clarifying questions (provided in context), use that " +
  "to narrow down further or give the final explanation.\n" +
  "- Respond with ONLY the raw JSON object. No markdown fences, no preamble, no trailing text.\n" +
  "- For the 'explain' action, format the answer following these rules:\n" +
  "  - Start with a one-line TL;DR in bold.\n" +
  "  - Use short paragraphs, **bold** for key terms, `backticks` for code.\n" +
  "  - Keep it compact — under 30 seconds to read.";

export const MODEL_OPTIONS = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (recommended)" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  // --- not chat/vision models: kept in the list as requested, will not work for capture → explain ---
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
      generationConfig: { maxOutputTokens: 1500 },
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

/* ------------------- lightweight markdown renderer ------------------- */

// Escapes HTML entities
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Renders inline markdown: **bold**, `code`
function renderInline(text) {
  let out = escapeHtml(text);
  // Bold: **text**
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

// Converts a markdown string to an HTML string
function markdownToHtml(md) {
  if (!md) return "";

  // Normalise line endings
  const raw = md.replace(/\r\n/g, "\n");

  // Split into blocks by fenced code first
  const parts = raw.split(/(```[\s\S]*?```)/g);
  let html = "";

  for (const part of parts) {
    // Fenced code block
    if (part.startsWith("```")) {
      const match = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
      const code = match ? match[2].replace(/\n$/, "") : part.slice(3, -3);
      html += `<pre><code>${escapeHtml(code)}</code></pre>`;
      continue;
    }

    // Process non-code blocks line by line
    const lines = part.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line — skip
      if (!trimmed) { i++; continue; }

      // Headings
      if (/^### /.test(trimmed)) {
        html += `<h3>${renderInline(trimmed.slice(4))}</h3>`;
        i++; continue;
      }
      if (/^## /.test(trimmed)) {
        html += `<h2>${renderInline(trimmed.slice(3))}</h2>`;
        i++; continue;
      }
      if (/^# /.test(trimmed)) {
        html += `<h1>${renderInline(trimmed.slice(2))}</h1>`;
        i++; continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        html += "<hr>";
        i++; continue;
      }

      // Blockquote
      if (trimmed.startsWith("> ")) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith("> ")) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        html += `<blockquote><p>${renderInline(quoteLines.join(" "))}</p></blockquote>`;
        continue;
      }

      // Unordered list (- item or * item)
      if (/^[-*] /.test(trimmed)) {
        html += "<ul>";
        while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
          html += `<li>${renderInline(lines[i].trim().slice(2))}</li>`;
          i++;
        }
        html += "</ul>";
        continue;
      }

      // Ordered list (1. item)
      if (/^\d+\.\s/.test(trimmed)) {
        html += "<ol>";
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          html += `<li>${renderInline(lines[i].trim().replace(/^\d+\.\s/, ""))}</li>`;
          i++;
        }
        html += "</ol>";
        continue;
      }

      // Paragraph — collect contiguous non-blank, non-special lines
      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^#{1,3} /.test(lines[i].trim()) &&
        !/^[-*] /.test(lines[i].trim()) &&
        !/^\d+\.\s/.test(lines[i].trim()) &&
        !/^> /.test(lines[i].trim()) &&
        !/^[-*_]{3,}$/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith("```")
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }
      if (paraLines.length > 0) {
        html += `<p>${renderInline(paraLines.join(" "))}</p>`;
      }
    }
  }

  return html;
}

// React component that renders markdown as formatted HTML
function RenderedMarkdown({ text }) {
  const html = useMemo(() => markdownToHtml(text), [text]);
  return <div className="loupe-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* -------------------------- visual pieces -------------------------- */

function ScanLine() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
      <div
        className="absolute left-0 right-0 h-8 bg-amber-400/25 animate-loupe-scan"
        style={{
          top: "-2rem",
          boxShadow: "0 0 16px 3px rgba(251,191,36,0.3)",
        }}
      />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 loupe-fade-in">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 bg-slate-800/50 border border-slate-700/60">
        <Sparkles size={13} className="text-amber-400" />
        <span className="text-xs text-slate-400 font-medium">Loupe is thinking</span>
        <span className="loupe-typing-dots flex gap-1 ml-0.5">
          <span /><span /><span />
        </span>
      </div>
    </div>
  );
}

function Eyebrow({ children, className = "" }) {
  return (
    <div className={"font-mono text-[0.65rem] uppercase tracking-[0.15em] text-slate-500 " + className}>
      {children}
    </div>
  );
}

/* ---------------------- Crop Calculation Helper ----------------------- */

function getCropRect(box_2d, hint, imgWidth, imgHeight) {
  let ymin, xmin, ymax, xmax;
  if (Array.isArray(box_2d) && box_2d.length === 4) {
    [ymin, xmin, ymax, xmax] = box_2d;
  } else {
    const h = (hint || "").toLowerCase();
    if (h.includes("far left") || h.includes("left panel") || h.includes("sidebar") || h.includes("explorer")) { ymin = 50; xmin = 0; ymax = 950; xmax = 320; }
    else if (h.includes("right sidebar") || h.includes("far right") || h.includes("right panel") || h.includes("assistant")) { ymin = 50; xmin = 680; ymax = 950; xmax = 1000; }
    else if (h.includes("bottom") || h.includes("terminal") || h.includes("pane") || h.includes("output")) { ymin = 620; xmin = 0; ymax = 1000; xmax = 1000; }
    else if (h.includes("top") || h.includes("tab") || h.includes("header") || h.includes("nav")) { ymin = 0; xmin = 0; ymax = 180; xmax = 1000; }
    else if (h.includes("center") || h.includes("editor") || h.includes("diff") || h.includes("middle")) { ymin = 100; xmin = 280; ymax = 750; xmax = 720; }
    else { ymin = 100; xmin = 100; ymax = 900; xmax = 900; }
  }

  ymin = Math.max(0, Math.min(1000, ymin));
  xmin = Math.max(0, Math.min(1000, xmin));
  ymax = Math.max(ymin + 30, Math.min(1000, ymax));
  xmax = Math.max(xmin + 30, Math.min(1000, xmax));

  // Add 4% padding around the box for surrounding context
  const padY = Math.round((ymax - ymin) * 0.05);
  const padX = Math.round((xmax - xmin) * 0.05);

  const cropYmin = Math.max(0, ymin - padY);
  const cropXmin = Math.max(0, xmin - padX);
  const cropYmax = Math.min(1000, ymax + padY);
  const cropXmax = Math.min(1000, xmax + padX);

  return {
    sx: (cropXmin / 1000) * imgWidth,
    sy: (cropYmin / 1000) * imgHeight,
    sWidth: ((cropXmax - cropXmin) / 1000) * imgWidth,
    sHeight: ((cropYmax - cropYmin) / 1000) * imgHeight,
    pctTop: (ymin / 1000) * 100,
    pctLeft: (xmin / 1000) * 100,
    pctWidth: ((xmax - xmin) / 1000) * 100,
    pctHeight: ((ymax - ymin) / 1000) * 100,
  };
}

/* ---------------------- Crop Preview Modal ----------------------- */

function CropPreviewModal({ screenshot, tagLabel, tagHint, box_2d, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState("crop"); // 'crop' | 'full'
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 }); // percentage

  useEffect(() => {
    // Disable background scrolling on body while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    return () => {
      // Restore background scrolling when modal closes
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Reset zoom when switching view modes
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setZoom(1);
    setOrigin({ x: 50, y: 50 });
  };

  useEffect(() => {
    if (!screenshot || !canvasRef.current || viewMode !== "crop") return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = screenshot;
    img.onload = () => {
      const rect = getCropRect(box_2d, tagHint, img.width, img.height);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = rect.sWidth;
      canvas.height = rect.sHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        rect.sx, rect.sy, rect.sWidth, rect.sHeight,
        0, 0, rect.sWidth, rect.sHeight
      );
    };
  }, [screenshot, tagHint, box_2d, viewMode]);

  // Mouse wheel zoom towards cursor location
  const handleWheel = (e) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const mouseY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    setOrigin({ x: mouseX, y: mouseY });

    setZoom((prevZoom) => {
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      const nextZoom = Math.min(5, Math.max(1, prevZoom + delta));
      return parseFloat(nextZoom.toFixed(2));
    });
  };

  // Move origin while hovering if zoomed in
  const handleMouseMove = (e) => {
    if (zoom <= 1 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const mouseY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setOrigin({ x: mouseX, y: mouseY });
  };

  // Click to toggle zoom (1x <-> 2.5x) focused on cursor position
  const handleClick = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const mouseY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setOrigin({ x: mouseX, y: mouseY });

    if (zoom === 1) {
      setZoom(2.5);
    } else {
      setZoom(1);
    }
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(5, parseFloat((z + 0.5).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const nz = Math.max(1, parseFloat((z - 0.5).toFixed(2)));
      if (nz === 1) setOrigin({ x: 50, y: 50 });
      return nz;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setOrigin({ x: 50, y: 50 });
  };

  if (!screenshot) return null;
  const rect = getCropRect(box_2d, tagHint, 1000, 1000);

  return (
    <div className="loupe-crop-modal-backdrop" onClick={onClose} onWheel={(e) => e.stopPropagation()}>
      <div className="loupe-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="loupe-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="loupe-modal-title">Cropped Screenshot Area</span>
            {tagLabel && (
              <span style={{ fontSize: "0.75rem", color: "#fcd34d", fontWeight: 600 }}>
                — {tagLabel}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* View mode toggle */}
            <div className="flex bg-slate-900 border border-slate-700/80 rounded-md p-0.5 text-[0.65rem] font-mono">
              <button
                onClick={() => handleViewModeChange("crop")}
                className={`px-2 py-0.5 rounded transition-all ${viewMode === "crop" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
              >
                Cropped Area
              </button>
              <button
                onClick={() => handleViewModeChange("full")}
                className={`px-2 py-0.5 rounded transition-all ${viewMode === "full" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
              >
                Full Screen
              </button>
            </div>

            {/* Zoom Controls Toolbar */}
            <div className="flex items-center gap-1 bg-slate-900 border border-amber-500/30 rounded-md px-1.5 py-0.5 text-xs text-amber-300 font-mono">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="p-1 hover:text-amber-200 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={12} />
              </button>
              <span
                onClick={handleResetZoom}
                className="text-[0.65rem] px-1 cursor-pointer hover:text-amber-100 font-bold tracking-tight"
                title="Click to reset zoom (100%)"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 5}
                className="p-1 hover:text-amber-200 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={12} />
              </button>
            </div>

            <button className="loupe-modal-close" onClick={onClose} aria-label="Close preview">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Image Body with Cursor Pointer Zoom */}
        <div
          className="p-4 flex flex-col items-center justify-center bg-slate-950 overflow-hidden select-none"
          style={{ maxHeight: "75vh" }}
        >
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            className="relative overflow-hidden rounded-lg border border-slate-800/80 bg-black/40 flex items-center justify-center transition-shadow"
            style={{
              cursor: zoom > 1 ? "zoom-out" : "zoom-in",
            }}
          >
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: `${origin.x}% ${origin.y}%`,
                transition: "transform 0.15s ease-out",
              }}
              className="relative flex items-center justify-center"
            >
              {viewMode === "crop" ? (
                <canvas
                  ref={canvasRef}
                  className="rounded-lg shadow-2xl border-2 border-amber-400/60 max-w-full max-h-[65vh] object-contain block"
                />
              ) : (
                <div className="relative inline-block max-w-full max-h-[65vh] overflow-hidden rounded-lg border border-slate-700">
                  <img src={screenshot} alt="Full screenshot" className="max-w-full max-h-[65vh] object-contain block" />
                  <div
                    className="absolute border-2 border-amber-400 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.6)] pointer-events-none"
                    style={{
                      top: `${rect.pctTop}%`,
                      left: `${rect.pctLeft}%`,
                      width: `${rect.pctWidth}%`,
                      height: `${rect.pctHeight}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3 text-[0.68rem] font-mono text-slate-400">
            <span>Scroll wheel or click image to zoom at cursor position</span>
            {tagHint && viewMode === "crop" && (
              <span className="text-amber-300 bg-amber-950/60 border border-amber-500/40 rounded px-2 py-0.5">
                Region: {tagHint}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------- Clarify Question Block ---------------------- */

function ClarifyQuestionBlock({ question, options, chain, onAnswer, onShowScreenshot, clarifyingTag, busy }) {
  return (
    <div className="loupe-clarify-bubble">
      <div className="loupe-clarify-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Sparkles size={12} className="text-amber-400" />
          <span className="font-mono text-[0.6rem] tracking-[0.18em] text-amber-500/70">LOUPE NEEDS CONTEXT</span>
        </div>
        <button
          className="loupe-eye-btn flex items-center gap-1 text-[0.65rem] px-2 py-0.5 bg-amber-400/15 border border-amber-400/35 text-amber-300 hover:bg-amber-400/25 rounded transition-all"
          onClick={() => onShowScreenshot(clarifyingTag)}
          title="Crop & view screen area for this question"
          aria-label="View crop"
        >
          <Eye size={13} />
          <span>Crop Area</span>
        </button>
      </div>

      {/* Show previous Q&A chain */}
      {chain.length > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          {chain.map((item, i) => (
            <div key={i} className="loupe-clarify-chain-item">
              <span className="chain-q">Q: {item.question}</span>
              <span style={{ color: "#475569" }}>→</span>
              <span className="chain-a">{item.selectedOption}</span>
            </div>
          ))}
        </div>
      )}

      <div className="loupe-clarify-question">{question}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {options.map((opt, i) => (
          <button
            key={i}
            className="loupe-clarify-option"
            onClick={() => onAnswer(opt)}
            disabled={busy}
          >
            <span className="loupe-option-bullet">{String.fromCharCode(65 + i)}</span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
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
  /* clarification props */
  clarifyQuestion,
  clarifyOptions,
  clarifyChain,
  clarifyingTag,
  onClarifyAnswer,
  showCropModal,
  onShowCropModal,
  onHideCropModal,
}) {
  const hasSession = !!screenshot;

  return (
    <div className="flex flex-col w-full h-full text-slate-100" style={{ background: "#0a0f1c" }}>
      {/* header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800/80 shrink-0"
           style={{ background: "linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(10,15,28,0.95) 100%)" }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full border border-amber-400/50 text-amber-400"
               style={{ background: "rgba(251,191,36,0.06)" }}>
            <Crosshair size={13} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-mono text-[0.7rem] font-semibold tracking-[0.2em] text-slate-100 leading-none">LOUPE</div>
            <div className="font-mono text-[0.55rem] tracking-[0.18em] text-slate-500 leading-none mt-0.5">
              SCREEN FIELD NOTES
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {hasSession && (
            <button
              onClick={onReset}
              title="Clear this session"
              aria-label="Clear session"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-all"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {pipSupported && !isPiP && (
            <button
              onClick={onPopOut}
              title="Pop out onto the desktop"
              aria-label="Pop out onto the desktop"
              className="p-1.5 rounded-md text-slate-500 hover:text-amber-400 hover:bg-slate-800/70 transition-all"
            >
              <Maximize2 size={14} />
            </button>
          )}
          {isPiP && (
            <button
              onClick={onDockBack}
              title="Dock back into the page"
              aria-label="Dock back into the page"
              className="p-1.5 rounded-md text-slate-500 hover:text-amber-400 hover:bg-slate-800/70 transition-all"
            >
              <Minimize2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3 loupe-scrollbar">
        {!hasApiKey && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2.5 text-sm text-amber-200 loupe-fade-in">
            <KeyRound size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs leading-relaxed">Add your Gemini API key on the left before capturing.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-800/50 bg-rose-950/30 px-3 py-2.5 text-xs text-rose-200 leading-relaxed loupe-fade-in">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Idle state — no session yet */}
        {!hasSession && stage === "idle" && (
          <div className="flex flex-col items-center text-center gap-3 py-10 loupe-fade-in">
            <div className="w-14 h-14 rounded-2xl border border-dashed border-slate-700/80 flex items-center justify-center text-slate-600"
                 style={{ background: "rgba(251,191,36,0.03)" }}>
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
            <div>
              <div className="text-slate-200 font-semibold text-sm">Point it at anything.</div>
              <div className="text-slate-500 text-xs mt-1.5 max-w-[14rem] leading-relaxed">
                Capture your screen and Loupe tags what's on it.
                Pick a tag to get a plain-English explainer.
              </div>
            </div>
          </div>
        )}

        {/* Capturing / Analyzing state */}
        {(stage === "capturing" || stage === "analyzing") && (
          <div className="space-y-2.5 loupe-fade-in">
            <div className="relative w-full h-28 rounded-lg border border-slate-800/80 bg-slate-900/80 overflow-hidden">
              {screenshot && (
                <img src={screenshot} alt="Captured screen" className="w-full h-full object-cover opacity-50" />
              )}
              <ScanLine />
              {/* shimmer bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 loupe-shimmer" />
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
              <Loader2 size={12} className="animate-spin text-amber-400" />
              {stage === "capturing" ? "Reading the screen…" : "Scanning for things to explain…"}
            </div>
          </div>
        )}

        {/* Session active — show screenshot + tags + chat */}
        {hasSession && stage !== "capturing" && stage !== "analyzing" && (
          <>
            {/* Screenshot thumbnail with eye icon */}
            <div className="relative w-full h-24 rounded-lg border border-slate-800/70 overflow-hidden group cursor-pointer"
                 onClick={onShowCropModal}>
              <img src={screenshot} alt="Captured screen" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
                <button
                  className="loupe-eye-btn"
                  onClick={(e) => { e.stopPropagation(); onShowCropModal(); }}
                  title="View full screenshot"
                  aria-label="View full screenshot"
                  style={{ background: "rgba(0,0,0,0.6)", borderColor: "rgba(148,163,184,0.25)" }}
                >
                  <Eye size={13} />
                  <span style={{ fontSize: "0.6rem", marginLeft: "0.25rem", color: "#94a3b8", fontFamily: "monospace", letterSpacing: "0.05em" }}>VIEW</span>
                </button>
              </div>
            </div>

            {/* Active clarification question */}
            {clarifyQuestion && (
              <ClarifyQuestionBlock
                question={clarifyQuestion}
                options={clarifyOptions}
                chain={clarifyChain}
                onAnswer={onClarifyAnswer}
                onShowScreenshot={onShowCropModal}
                clarifyingTag={clarifyingTag}
                busy={busy}
              />
            )}

            {/* Tag options — only show when NOT in a clarification flow */}
            {!clarifyQuestion && options.length > 0 && (
              <div className="space-y-2">
                <Eyebrow>What should Loupe explain?</Eyebrow>
                <div className="space-y-1.5">
                  {options.map((opt, i) => (
                    <div
                      key={i}
                      className="loupe-tag-btn w-full flex items-center justify-between gap-2 text-left rounded-lg border border-slate-800/70 hover:border-amber-400/50 bg-slate-900/40 hover:bg-slate-800/50 px-3 py-2 transition-all group"
                    >
                      <button
                        onClick={() => onChooseOption(opt)}
                        disabled={busy}
                        className="flex-1 flex items-start gap-2.5 text-left min-w-0 disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <span className="font-mono text-[0.65rem] text-amber-400 border border-amber-400/30 rounded px-1 py-0.5 mt-px shrink-0 bg-amber-400/5">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.8rem] text-slate-100 leading-snug font-medium group-hover:text-amber-300 transition-colors">
                            {opt.label}
                          </span>
                          {opt.hint && (
                            <span className="block text-[0.68rem] text-slate-500 leading-snug mt-0.5">{opt.hint}</span>
                          )}
                        </span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowCropModal(opt);
                        }}
                        disabled={busy}
                        className="loupe-eye-btn p-1.5 rounded-md text-amber-400/80 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 transition-all shrink-0 ml-1"
                        title={`Crop & view ${opt.label}`}
                        aria-label={`Crop and view ${opt.label}`}
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onRetake}
              className="text-[0.65rem] font-mono uppercase tracking-[0.12em] text-slate-500 hover:text-amber-400 transition-colors"
            >
              ↻ Capture again
            </button>
          </>
        )}

        {/* Crop Preview Modal */}
        {showCropModal && (
          <CropPreviewModal
            screenshot={screenshot}
            tagLabel={showCropModal?.label || clarifyingTag?.label}
            tagHint={showCropModal?.hint || clarifyingTag?.hint}
            box_2d={showCropModal?.box_2d || clarifyingTag?.box_2d}
            onClose={onHideCropModal}
          />
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="space-y-3 pt-1">
            {messages.map((m, i) => (
              <div key={i} className={"loupe-msg-bubble " + (m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start")}
                   style={{ animationDelay: `${i * 0.05}s` }}>
                {/* Role label */}
                <span className={"font-mono text-[0.6rem] tracking-[0.18em] mb-1 " +
                  (m.role === "user" ? "text-amber-500/70" : "text-slate-500")}>
                  {m.role === "user" ? "YOU" : "LOUPE"}
                </span>

                {m.role === "user" ? (
                  /* User bubble — simple text */
                  <div className="max-w-[88%] rounded-lg rounded-tr-sm px-3 py-2 text-[0.8rem] bg-amber-400/8 border border-amber-400/20 text-amber-100">
                    {m.text}
                  </div>
                ) : (
                  /* Loupe bubble — rendered markdown */
                  <div className="w-full rounded-lg rounded-tl-sm px-3 py-2.5 bg-slate-800/40 border border-slate-700/50"
                       style={{ background: "linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.6) 100%)" }}>
                    <RenderedMarkdown text={m.text} />
                  </div>
                )}
              </div>
            ))}
            {busy && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* input bar */}
      <div className="border-t border-slate-800/70 px-3 py-2.5 shrink-0" style={{ background: "rgba(10,15,28,0.9)" }}>
        <div className="flex items-end gap-1.5">
          {!hasSession ? (
            <button
              onClick={onCapture}
              disabled={busy || stage === "capturing" || stage === "analyzing" || !hasApiKey}
              className="flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs px-3 py-2 transition-all disabled:opacity-40 shrink-0 shadow-lg shadow-amber-400/10"
            >
              <Camera size={14} />
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
                ? "Tell Loupe what to focus on…"
                : options.length > 0
                ? "Or type what you want explained…"
                : "Ask a follow-up…"
            }
            rows={1}
            className="flex-1 resize-none rounded-lg bg-slate-900/70 border border-slate-800/70 focus:border-amber-400/50 focus:outline-none text-xs text-slate-100 placeholder-slate-600 px-3 py-2 max-h-20 transition-colors"
          />

          <button
            onClick={onSend}
            disabled={busy || !promptText.trim() || !hasApiKey}
            aria-label="Send"
            title="Send"
            className="p-2 rounded-lg text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-20 disabled:cursor-not-allowed transition-all shrink-0 shadow-lg shadow-amber-400/10"
          >
            <Send size={13} />
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
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
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

  /* --- Clarification flow state --- */
  const [clarifyChain, setClarifyChain] = useState([]);        // [{question, selectedOption}, ...]
  const [clarifyQuestion, setClarifyQuestion] = useState(null); // current question string
  const [clarifyOptions, setClarifyOptions] = useState([]);     // current option strings
  const [clarifyingTag, setClarifyingTag] = useState(null);     // the tag that triggered clarification
  const [showCropModal, setShowCropModal] = useState(null);     // crop tag object or null

  const apiMessagesRef = useRef([]); // Gemini-format history ({role, parts}) for the current screenshot session
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
  }, [messages, busy, clarifyQuestion]);

  const clearClarification = useCallback(() => {
    setClarifyChain([]);
    setClarifyQuestion(null);
    setClarifyOptions([]);
    setClarifyingTag(null);
  }, []);

  const cloneStylesInto = (targetDoc) => {
    try {
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        targetDoc.head.appendChild(node.cloneNode(true));
      });
    } catch (_) {
      /* non-fatal: PiP window keeps working, just less styled */
    }
  };

  const openPiP = useCallback(async () => {
    if (!("documentPictureInPicture" in window)) {
      setError("Pop-out isn't supported in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 420, height: 650 });
      cloneStylesInto(pip.document);
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#0a0f1c";
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
    clearClarification();
  }, [clearClarification]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ---------- Clarification flow ---------- */

  const processClarifyResponse = useCallback(
    (text, tag, currentChain) => {
      // Parse the AI's JSON response
      let parsed;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch (_) {
        // If parsing fails, treat it as a direct explanation
        parsed = { action: "explain", answer: text };
      }

      if (parsed.action === "clarify" && parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
        // AI wants more context — show the next question
        setClarifyQuestion(parsed.question);
        setClarifyOptions(parsed.options);
      } else {
        // AI is ready to explain — put the answer in chat
        const answer = parsed.answer || parsed.text || text;
        setMessages((prev) => [
          ...prev,
          { role: "user", text: tag.label + (currentChain.length > 0 ? " → " + currentChain.map(c => c.selectedOption).join(" → ") : "") },
          { role: "assistant", text: answer },
        ]);
        // Put the explanation into the API history for follow-ups
        const contextSummary = currentChain.map(c => `Q: ${c.question} → A: ${c.selectedOption}`).join("\n");
        apiMessagesRef.current = [
          {
            role: "user",
            parts: [
              ...(screenshot ? [imagePartFromDataUrl(screenshot)] : []),
              { text: `Explain "${tag.label}" (${tag.hint || "seen in the screenshot"}).${contextSummary ? "\nContext:\n" + contextSummary : ""}` },
            ],
          },
          { role: "model", parts: [{ text: answer }] },
        ];
        clearClarification();
      }
    },
    [screenshot, clearClarification]
  );

  const startClarification = useCallback(
    async (tag) => {
      if (!apiKey) {
        setError("Add your Gemini API key first.");
        return;
      }
      setBusy(true);
      setError("");
      setClarifyingTag(tag);
      setClarifyChain([]);
      setClarifyQuestion(null);
      setClarifyOptions([]);

      try {
        const requestText =
          `The learner selected: "${tag.label}" (${tag.hint || "seen in the screenshot"}). ` +
          `Decide if this is specific enough to explain directly, or if you need to ask a clarifying question.`;

        const clarifyMessages = [
          {
            role: "user",
            parts: [
              ...(screenshot ? [imagePartFromDataUrl(screenshot)] : []),
              { text: requestText },
            ],
          },
        ];

        const reply = await callGemini(apiKey, modelId, CLARIFY_SYSTEM_PROMPT, clarifyMessages);
        processClarifyResponse(reply, tag, []);
      } catch (err) {
        setError("Loupe couldn't process that: " + err.message);
        clearClarification();
      } finally {
        setBusy(false);
      }
    },
    [apiKey, modelId, screenshot, processClarifyResponse, clearClarification]
  );

  const onClarifyAnswer = useCallback(
    async (selectedOption) => {
      if (!clarifyingTag) return;
      setBusy(true);
      setError("");

      const newChain = [...clarifyChain, { question: clarifyQuestion, selectedOption }];
      setClarifyChain(newChain);
      setClarifyQuestion(null);
      setClarifyOptions([]);

      try {
        // Build context from the entire chain
        const chainContext = newChain
          .map((c) => `Q: ${c.question}\nA: ${c.selectedOption}`)
          .join("\n\n");

        const requestText =
          `The learner selected: "${clarifyingTag.label}" (${clarifyingTag.hint || "seen in the screenshot"}).\n\n` +
          `Previous clarifications:\n${chainContext}\n\n` +
          `Based on these answers, either explain now or ask another clarifying question if still unclear.`;

        const clarifyMessages = [
          {
            role: "user",
            parts: [
              ...(screenshot ? [imagePartFromDataUrl(screenshot)] : []),
              { text: requestText },
            ],
          },
        ];

        const reply = await callGemini(apiKey, modelId, CLARIFY_SYSTEM_PROMPT, clarifyMessages);
        processClarifyResponse(reply, clarifyingTag, newChain);
      } catch (err) {
        setError("Loupe couldn't process that: " + err.message);
        clearClarification();
      } finally {
        setBusy(false);
      }
    },
    [apiKey, modelId, screenshot, clarifyingTag, clarifyChain, clarifyQuestion, processClarifyResponse, clearClarification]
  );

  /* ---------- Original option/send handlers ---------- */

  const onChooseOption = useCallback(
    (option) => {
      const extra = promptText.trim();
      if (extra) {
        // If user typed something specific, skip clarification and explain directly
        const requestText =
          `Explain "${option.label}" (${option.hint || "seen in the screenshot"}). ` +
          `Teach it like a quick, clear coding lesson: what it is, why it's there, and a tiny example if relevant.` +
          ` Also take this into account: ${extra}`;
        const isFirstTurn = apiMessagesRef.current.length === 0;
        askLoupe(option.label + " — " + extra, requestText, isFirstTurn);
        setPromptText("");
      } else {
        // No extra text — go through the clarification flow
        startClarification(option);
        setPromptText("");
      }
    },
    [askLoupe, startClarification, promptText]
  );

  const onSend = useCallback(() => {
    const text = promptText.trim();
    if (!text) return;
    // If we're in a clarification flow, send as a free-text clarification
    if (clarifyQuestion && clarifyingTag) {
      // Treat typed text as a custom answer to the clarification
      onClarifyAnswer(text);
      setPromptText("");
      return;
    }
    const isFirstTurn = apiMessagesRef.current.length === 0;
    askLoupe(text, text, isFirstTurn && !!screenshot);
    setPromptText("");
  }, [askLoupe, promptText, screenshot, clarifyQuestion, clarifyingTag, onClarifyAnswer]);

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
    /* clarification props */
    clarifyQuestion,
    clarifyOptions,
    clarifyChain,
    clarifyingTag,
    onClarifyAnswer,
    showCropModal,
    onShowCropModal: (tag) => setShowCropModal(tag || { label: "Full Screenshot", hint: "Full view", box_2d: [0, 0, 1000, 1000] }),
    onHideCropModal: () => setShowCropModal(null),
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
              className="w-96 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-center gap-3 p-8"
              style={{ height: 580 }}
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
            <div className="w-96 rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl shadow-black/40" style={{ height: 580 }}>
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
