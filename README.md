# 🎯 Drawing Overlay Mobile Tool

A mobile-first web app for artists to compare their traditional drawings with reference photos — using advanced visual measurement, gesture analysis, and AI-assisted sighting tools.

This tool empowers artists with overlays, proportion feedback, landmark detection, and training views to improve accuracy and confidence in sight-size and observational drawing.

---

## ✨ Features

✅ Dual image overlay (reference + drawing)  
✅ Manual alignment (drag, scale, edge snap)  
✅ Auto outline extraction  
✅ Point placement for measuring angles, distances, ratios  
✅ Base unit comparison system (e.g., eye width = 1.0)  
✅ Triangulation lines and construction aids  
✅ Negative space and shape simplification views  
✅ Perspective and gesture grid overlays  
✅ Ghost correction + landmark deviation visualizer  
✅ Memory & training modes  
✅ Export: PNG, time-lapse, session JSON  
✅ PWA support (installable as a mobile app)  
✅ Offline use and local session save/load

---

## 📱 Mobile-First Design

Built to work on touchscreens with:
- Responsive fullscreen layout
- Tap, drag, long-press, and pinch-to-zoom support
- Minimal UI clutter for small devices

---

## 🚀 How to Use

1. Run `npm run dev` and open `http://localhost:3000` (Node 18+ required; no build step).
2. Paste your OpenAI API key in the bottom **Cloud AI** bar, click **Enter**, then toggle **ON** to use cloud face detection and alignment (the key stays only in the local server's memory).
3. Leave the toggle **OFF** to use the built-in on-device MediaPipe tools.
4. Upload your reference image and drawing, then use the overlay, measurement, and analysis tools.
5. Export overlay results, session saves, or time-lapses, or install as a PWA for offline use.

### 🧪 Quick regression check

1. Run `npm run dev` and open `http://localhost:3000`.
2. Confirm the bottom Cloud AI bar appears; with no key entered the toggle should be disabled and the app should stay in Local mode.
3. Upload at least one image (both reference and drawing if available).
4. Open DevTools and run `document.getElementById('overlayCanvas').getContext('2d').getImageData(window.innerWidth/2, window.innerHeight/2, 1, 1).data[3]`.
5. The returned alpha value should be greater than `0` unless the uploaded image is transparent at the center.

---

## 🧠 Tech Stack

- HTML5 Canvas API  
- Vanilla JavaScript (ES6 Modules)  
- TensorFlow.js (for AI-based landmark detection)  
- MediaPipe Pose / FaceMesh (planned)  
- No frameworks, no build system — lightweight and fast

---

## 🧩 Folder Structure

drawing-overlay-app/
├── index.html
├── public/
│ ├── manifest.json
│ └── icons/
├── src/
│ ├── app.js
│ ├── styles/
│ ├── utils/
│ └── components/

---

## 📦 To-Do / Roadmap

See [GitHub Project Board](https://github.com/tlabs001/Overlay/projects) or open issues for detailed planning.


## ▲ Deploy to Vercel (`overlay_studios`)

This project is a static app with a lightweight Node dev server for local development, so Vercel deployment should use **Static Site** settings (no custom server runtime).

### 1) Prepare the repo

1. Make sure your project is committed to GitHub (or GitLab/Bitbucket).
2. Confirm the root contains `index.html`, `src/`, and `public/`.
3. No build step is required.

### 2) Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the `overlay_studios` repository.
3. In **Configure Project**:
   - **Framework Preset**: `Other`
   - **Root Directory**: `.`
   - **Build Command**: *(leave empty)*
   - **Output Directory**: `.`
   - **Install Command**: *(leave empty or `npm install`)*
4. Click **Deploy**.

### 3) Add `vercel.json` (recommended)

Create a `vercel.json` in the repo root so routing and caching are explicit:

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/service-worker.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    },
    {
      "source": "/public/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Then commit and push; Vercel will auto-redeploy.

### 4) Environment variables (optional)

If you later move cloud API calls server-side, add env vars in **Vercel → Project → Settings → Environment Variables**. For the current client-only flow, no required Vercel env vars are needed.

### 5) Verify after deploy

1. Open the Vercel URL.
2. Confirm `index.html` loads and both image uploads work.
3. Confirm `manifest.json` and `service-worker.js` load successfully.
4. On mobile, test install prompt / Add to Home Screen behavior.

### 6) CLI alternative (optional)

```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

When prompted:
- Link to existing `overlay_studios` project (or create new).
- Set output directory to `.`.


---

## 📄 License

MIT — free to use, modify, and build upon.

🗺️ Roadmap Format (GitHub Issues or Project Board)
You can create these as GitHub Issues with labels and milestones, or use GitHub Projects (beta) with drag-and-drop columns.
Here’s your roadmap:

### 🚧 Milestone 1: Core Sighting Tools
| Feature | Status |
| --- | --- |
| Upload ref + drawing | ✅ Done |
| Manual alignment tools | ✅ Done |
| Point placement + distance | ⬅️ Codex prompt ready |
| Angle measurement | ⬅️ Codex prompt ready |
| Base unit / ratios | ⬅️ Codex prompt ready |
| Export overlay | ✅ Done |

### 🚧 Milestone 2: Visual Training Modes
| Feature | Status |
| --- | --- |
| Negative space toggle | Prompted |
| Shape simplification | Prompted |
| Posterization planes | Prompted |
| Triangulation tools | Prompted |
| Gesture + manual lines | Prompted |

### 🚧 Milestone 3: AI-Powered Tools
| Feature | Status |
| --- | --- |
| MediaPipe Pose + Face detection | Not started |
| Auto landmark comparison | Planned |
| Critique mode scoring | Planned |
| Ghost correction overlays | Prompted |

### 🚧 Milestone 4: Export, Sharing, Persistence
| Feature | Status |
| --- | --- |
| Save/load sessions | In progress |
| Export as JSON or PNG | ✅ Done |
| Time-lapse export | Planned |
| Installable PWA | Planned |

### 🧪 Milestone 5: UX & Polish
| Feature | Status |
| --- | --- |
| Clean button UI | Coming |
| Icon set for tools | Coming |
| Gesture tutorials/help | Coming |
| Color themes (dark/light) | Optional |
