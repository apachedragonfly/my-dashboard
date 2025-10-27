# **Website Architecture Document (v2.0)**  
*Updated: October 27, 2025*  
*Incorporating Goodreads API as primary reading tracker with Kobo fallback*

---

## **1. Project Overview**

A minimalist, high-performance personal dashboard inspired by [sarthakmishra.com](https://sarthakmishra.com/) and [seated.ro](https://seated.ro). The site showcases **daily music ideas**, **real-time reading progress**, and **Anki learning stats** in a clean, dark-mode grid layout.

### **Core Features**
| Feature | Source | Update Frequency |
|-------|--------|------------------|
| Daily Music Ideas Grid | `music.json` (manual/CMS) | Daily (manual) |
| Reading Progress | **Goodreads API** (primary) + `kobo.json` (fallback) | Real-time (cached 10 min) |
| Anki Flashcard Stats | AnkiConnect (localhost API) | On-demand (cached 5 min) |

---

## **2. Tech Stack**

| Layer | Technology |
|------|------------|
| **Framework** | [Astro](https://astro.build) (SSG + Islands) |
| **Styling** | Tailwind CSS |
| **Deployment** | Vercel (auto-deploy, serverless functions) |
| **Data** | JSON + Serverless APIs |
| **Version Control** | Git + GitHub |
| **Runtime** | Node.js 18+ |

---

## **3. System Architecture**

```
┌─────────────────────┐
│     Client Browser   │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐     ┌──────────────────────┐
│   Astro SSG Pages    │────►│  Vercel Edge Cache   │
└───────┬────────┬────┘     └─────────▲────────────┘
        │        │                    │
        ▼        ▼                    │
┌─────────────────────┐   ┌──────────────────────┐
│ /api/goodreads.ts   │   │ /api/anki.ts         │
│ (Goodreads Proxy)   │   │ (AnkiConnect Proxy)  │
└───────┬─────────────┘   └───────┬──────────────┘
        │                         │
        ▼                         ▼
┌─────────────────────┐   ┌──────────────────────┐
│ Goodreads API (XML)  │   │ AnkiConnect (localhost)│
│ OAuth 1.0a           │   │ http://localhost:8765│
└─────────────────────┘   └──────────────────────┘
```

> **Static assets** (`music.json`, fallback `kobo.json`) are bundled at build time.  
> **Dynamic data** (Goodreads, Anki) is fetched via **serverless functions** with edge caching.

---

## **4. File Structure**

```
my-dashboard/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── MusicGrid.astro
│   │   ├── ReadingProgress.astro
│   │   └── AnkiStats.astro
│   ├── data/
│   │   ├── music.json          # [{date, idea, link}]
│   │   └── kobo.json           # Fallback: [{title, progress, pages, current}]
│   ├── pages/
│   │   ├── index.astro
│   │   └── api/
│   │       ├── goodreads.ts    # Serverless: Goodreads → JSON
│   │       └── anki.ts         # Serverless: AnkiConnect → JSON
│   └── layouts/
│       └── Layout.astro
├── astro.config.mjs
├── tailwind.config.js
├── package.json
└── .env                    # GOODREADS_KEY, GOODREADS_SECRET, GOODREADS_USER_ID
```

---

## **5. Core Modules**

### **5.1 Daily Music Ideas Grid**
- **Source**: `src/data/music.json`
- **Format**:
  ```json
  [
    {
      "date": "2025-10-27",
      "idea": "Ambient drone + field recordings",
      "link": "https://open.spotify.com/track/abc123"
    }
  ]
  ```
- **Display**: 30-day calendar grid (7×5 layout on desktop)
- **Behavior**:
  - Today highlighted
  - Links open in new tab
  - Empty days show `—`
  - Optional: Spotify embed on hover

### **5.2 Reading Progress (Goodreads API + Kobo Fallback)**

#### **Primary: Goodreads API**
- **Endpoint**: `/api/goodreads.ts`
- **Auth**: OAuth 1.0a (signed requests)
- **Response**:
  ```ts
  {
    title: "Dune",
    progress: 67,
    pages: 412,
    current: true
  }
  ```
- **Caching**: `Cache-Control: s-maxage=600` (10 min)
- **Rate Limit**: 1 req/sec → safe with cache

#### **Fallback: Kobo Export**
- **Source**: `src/data/kobo.json` (manual or Calibre sync)
- **Used when**:
  - Goodreads API fails
  - User prefers privacy
  - Offline viewing

#### **Component Logic (`ReadingProgress.astro`)**
```astro
---
let book = null;
let source = '';

// 1. Try Goodreads
try {
  const res = await fetch('/api/goodreads');
  if (res.ok) {
    book = await res.json();
    source = 'Goodreads';
  }
} catch {}

// 2. Fallback to Kobo JSON
if (!book) {
  const kobo = await import('../data/kobo.json');
  book = kobo.find(b => b.current);
  source = book ? 'Kobo (cached)' : null;
}
---
<div class="bg-gray-800 p-5 rounded-lg">
  <h3 class="text-lg font-medium mb-2">
    Currently Reading <span class="text-xs text-gray-500">({source})</span>
  </h3>
  {#if book}
    <p class="font-semibold">{book.title}</p>
    <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
      <div
        class="bg-emerald-500 h-2 rounded-full transition-all"
        style={`width: ${book.progress}%`}
      ></div>
    </div>
    <p class="text-sm text-gray-400 mt-1">
      {book.progress}% • {book.pages} pages
    </p>
  {:else}
    <p class="text-gray-500 italic">No active book</p>
  {/if}
</div>
```

---

### **5.3 Anki Progress Tracker**

- **Source**: AnkiConnect (`http://localhost:8765`)
- **Proxy**: `/api/anki.ts` (serverless function)
- **Actions Used**:
  - `getNumCardsReviewedToday`
  - `getCollectionStatsToday`
  - `deckNames` (optional)
- **Caching**: 5 min (`s-maxage=300`)
- **Fallback**: Show "Anki offline" with last known stats (optional)

#### **API Route (`/api/anki.ts`)**
```ts
export const GET: APIRoute = async () => {
  const payload = {
    action: "getNumCardsReviewedToday",
    version: 6
  };

  try {
    const res = await fetch('http://localhost:8765', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    return new Response(JSON.stringify({ today: data.result }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60'
      }
    });
  } catch {
    return new Response(JSON.stringify({ today: 0, error: true }), { status: 503 });
  }
};
```

---

## **6. Environment Variables (`.env`)**
```env
GOODREADS_KEY=your_dev_key
GOODREADS_SECRET=your_dev_secret
GOODREADS_USER_ID=12345678
ANKI_CONNECT_HOST=http://localhost:8765
```

> **Security Note**: Never expose AnkiConnect publicly. Run on personal machine or secure VPS.

---

## **7. Deployment & CI/CD**

| Step | Tool |
|------|------|
| **Repo** | GitHub |
| **Build** | `npm run build` → `dist/` |
| **Deploy** | Vercel (auto on push to `main`) |
| **Preview** | Vercel Preview URLs |
| **Caching** | Edge cache via `Cache-Control` headers |

---

## **8. Data Update Workflows**

| Data | Method | Frequency |
|------|--------|-----------|
| `music.json` | Manual edit + commit | Daily |
| Goodreads | Auto via API | Real-time (cached) |
| `kobo.json` | Optional Calibre export → GitHub Action | Weekly (backup) |
| Anki | Auto via AnkiConnect | On page load |

---

## **9. UI/UX Guidelines**

- **Theme**: Dark (`bg-gray-900`, `text-white`)
- **Font**: System sans-serif or Inter
- **Layout**:
  - Mobile: Vertical stack
  - Desktop: Music grid full-width, Reading + Anki side-by-side
- **Animations**: `animate-pulse` for loading states
- **Accessibility**: ARIA labels, focus styles, alt text

---

## **10. Risks & Mitigations**

| Risk | Mitigation |
|------|------------|
| Goodreads API down | Fallback to `kobo.json` |
| AnkiConnect unreachable | Show cached/offline state |
| Rate limit exceeded | Cache aggressively (10 min+) |
| OAuth key exposure | Use Vercel env vars (never in code) |
| Kobo sync breaks | Manual JSON update as backup |

---

## **11. Future Enhancements**

- [ ] Light/dark mode toggle
- [ ] Music idea submission form (Netlify Functions)
- [ ] Anki heatmap (SVG + Review Heatmap data)
- [ ] RSS feed for music ideas
- [ ] PWA support
- [ ] Goodreads "Want to Read" shelf preview

---

## **12. Conclusion**

This architecture delivers a **fast, maintainable, and live-updating** personal dashboard:
- **Goodreads API** replaces fragile Kobo sync with **real-time progress**.
- **Astro + serverless functions** keep the site **static-first** and **blazing fast**.
- **Fallbacks** ensure resilience.

**Build command**: `npm create astro@latest && npm run dev`  
**Deploy**: Push to GitHub → Vercel auto-deploys.

> **Next Step**: Set up Goodreads developer key and test `/api/goodreads` endpoint.