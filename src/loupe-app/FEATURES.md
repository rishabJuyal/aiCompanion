# 🌟 Loupe AI Companion — Feature Catalog & Changelog

This document tracks all implemented features, capabilities, UI components, and feature history for the **Loupe AI Screen Companion**.

> 💡 **Maintainer Note**: Update this file whenever a new feature, UI enhancement, or API capability is added to the Loupe component codebase.

---

## 📸 Core Features Overview

```
 ┌────────────────────────────────────────────────────────┐
 │                     LOUPE APP                          │
 ├──────────────────┬──────────────────┬──────────────────┤
 │  Screen Capture  │   AI Tagging     │  Clarification   │
 │   & Snapshot     │  & Auto-Detect   │  Multi-Q Loop    │
 ├──────────────────┼──────────────────┼──────────────────┤
 │  Eye Crop Preview│  Picture-in-Pic  │   Gemini API     │
 │  Dual Canvas Mode│  Desktop Float   │  Model Selection │
 └──────────────────┴──────────────────┴──────────────────┘
```

---

## 🚀 Complete Feature Catalog

### 1. 🔍 Screen Capture & Snapshot System
- **Single-Frame Capture**: Uses `navigator.mediaDevices.getDisplayMedia` to take high-resolution snapshots of your desktop, IDE, terminal, or browser tab.
- **Auto Video Track Teardown**: Automatically releases screen recording permissions as soon as the image frame is captured.
- **Shimmer & Scanline Animation**: Laser scanner effect while analyzing screen content.

---

### 2. 🏷️ AI Screen Tagging & Feature Extraction
- **Visual Element Recognition**: Automatically identifies 4 to 7 distinct, concrete elements on your screen (e.g. sidebar panels, git diff lines, error traces, header tabs).
- **Normalized 2D Bounding Boxes**: Requests normalized `[ymin, xmin, ymax, xmax]` coordinates from Gemini vision models for each identified UI element.
- **Smart Location Fallbacks**: Intelligent spatial positioning fallback rules (`far left panel`, `bottom terminal`, `top tab`) when coordinate bounds are partial.

---

### 3. 👁️✂️ Interactive Crop Preview (Eye Icon)
- **Dedicated Eye Button on Every Tag**: Each tag card item (`01 File Explorer sidebar`, `02 Git diff editor`, etc.) features an **Eye icon button** (`👁`).
- **Canvas-Based Cropped Image Generation**: Generates an isolated, zoomed HTML `<canvas>` crop of the exact area on the screen.
- **Dual View Modes in Modal**:
  - ✂️ **Cropped Area**: Zoomed canvas cut-out of the specific UI element.
  - 🔍 **Full Screen**: Full screenshot with a glowing amber bounding box highlighting where the element lives on screen.
- **Question & Message Block Crop Access**: Eye icons on clarification question headers allow instant verification of the region being discussed.

---

### 4. ❓💬 Dynamic Multi-Question Clarification Loop
- **Ambiguity Detection**: AI evaluates if a selected tag is too broad or covers multiple elements.
- **Interactive Multi-Choice Cards**: Generates targeted follow-up questions with selectable option cards (`A`, `B`, `C`).
- **Sequential Q&A Chain Tracking**: Displays the conversation reasoning chain (`Q: ... → A: ...`) as context builds.
- **Free-Text Answer Shortcut**: Allows users to type custom clarification answers or add extra prompt text to bypass clarification when needed.

---

### 5. 🖥️ Floating Desktop Window (Picture-in-Picture)
- **Desktop Picture-in-Picture API**: Uses `window.documentPictureInPicture` to pop out Loupe into a floating desktop window over any application (VS Code, terminal, Figma).
- **React Portal Synchronization**: Uses `createPortal` to maintain complete state continuity between docked and popped-out states without reloading state.
- **Style Cloning**: Auto-clones styles and keyframe animations into the PiP window document.

---

### 6. 🔑 Multi-Model AI Engine & API Key Management
- **Direct Gemini API Integration**: Connects straight to Google AI Studio REST endpoints.
- **Supported Models**: `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-pro`, `gemini-2.5-flash`, etc.
- **Local Storage Persistence**: API key is saved safely in client-side `localStorage`.

---

### 7. 🎨 Rich Dark Aesthetic & Markdown Formatting
- **Custom Markdown Renderer**: Formats bold key terms, inline code tags, bullet lists, fenced code blocks, and blockquotes for high readability.
- **Ambient Glassmorphic UI**: Sleek slate-950 theme with amber accents (`#fbbf24`) and animated typing dots.

---

## 📜 Feature Changelog

### v1.2.0 — (2026-08-09)
- ✨ **Added**: Tag-specific Eye icon buttons on every tag option card.
- ✨ **Added**: HTML `<canvas>` crop rendering for isolated element previews.
- ✨ **Added**: Dual View Mode (`Cropped Area` vs `Full Screen with Bounding Box`) inside Crop Preview Modal.
- ✨ **Added**: Dynamic Multi-Question Clarification Loop with `CLARIFY_SYSTEM_PROMPT`.
- ✨ **Added**: Q&A history chain UI inside clarification question blocks.

### v1.1.0 — (2026-08-09)
- ✨ **Added**: Reusable standalone component packaging in `src/loupe-app/`.
- ✨ **Added**: Document Picture-in-Picture floating window support.
- ✨ **Added**: Expanded Gemini model selector options (`MODEL_OPTIONS`).

### v1.0.0 — (2026-08-09)
- 🎉 **Initial Release**: Screen capture, AI tagging, chat explainers, and API key management bar.

---

## 🔮 Future Feature Roadmap
- [ ] 🔊 Speech output (Text-to-Speech) for audio explainers while coding.
- [ ] 🎯 Manual drag-to-select custom box crop tool on screen.
- [ ] 💾 Session history export (save screen notes as Markdown / PDF).
