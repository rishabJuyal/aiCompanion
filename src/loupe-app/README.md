# Loupe AI Companion - Reusable Component Folder

This folder (`loupe-app`) contains the complete, self-contained **Loupe AI companion** React component, including its styles, animations, API integrations, and floating window capabilities.

You can copy this single folder into any React application codebase to instantly add Loupe's floating screen-reading and coding tutor functionality.

---

## 📁 Folder Contents

```
loupe-app/
├── LoupeApp.jsx           # Main React component (Screen capture, AI Vision, Chat & PiP window)
├── loupe-app-styles.css   # Styles, keyframe animations, and custom scrollbar rules
└── README.md              # Reusability & dependency setup guide (this file)
```

---

## ⚡ Quick Setup & Usage

### 1. Copy the folder
Copy the entire `loupe-app` folder into your React project's `src/` directory (or wherever components live):

```bash
# Example
cp -r src/loupe-app ./your-react-app/src/
```

### 2. Install Required Dependencies
Make sure the following peer dependencies are installed in your project:

```bash
npm install lucide-react react react-dom
```

| Package | Purpose |
|---|---|
| `lucide-react` | Icons (`Camera`, `Send`, `Crosshair`, `KeyRound`, `RotateCcw`, etc.) |
| `react` | UI rendering and state hooks |
| `react-dom` | Portals for Document Picture-in-Picture window support |

### 3. Styling Requirement (Tailwind CSS)
Loupe uses utility classes from **Tailwind CSS** along with custom animations in `loupe-app-styles.css`.
- Ensure your project has **Tailwind CSS** installed or loaded via CDN/PostCSS.
- `loupe-app-styles.css` is imported directly in `LoupeApp.jsx` to load `@keyframes loupe-scan` and custom scrollbars automatically.

### 4. Import & Render Component

In your React app:

```jsx
import React from 'react';
import LoupeApp from './loupe-app/LoupeApp';

export default function App() {
  return <LoupeApp />;
}
```

---

## 🔑 Features & Configuration

- **Screen Capture**: Uses `navigator.mediaDevices.getDisplayMedia` to capture a screenshot of your code or UI.
- **AI Tagging & Explanations**: Integrates directly with Google Gemini models (`gemini-3.6-flash`, `gemini-2.5-flash`, etc.).
- **Floating Desktop Window (Picture-in-Picture)**: Uses the Chrome/Edge Document Picture-in-Picture API to float Loupe outside the browser tab.
- **API Key Storage**: Prompts for a Google Gemini API Key (`AIzaSy...`) which is stored locally in `localStorage`.

---

## 🌐 Browser Requirements

- **Supported Desktop Browsers**: Google Chrome or Microsoft Edge.
- **Protocol**: Must run on `http://localhost` or `https://` (browser security requirement for screen capture).
