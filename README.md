# PrepVida.in — Website Files

This is a plain HTML/CSS/JS website. No build tools, no `npm install` needed.
It connects directly to Supabase from the browser.

## What's included
- `index.html` — Login / Signup
- `pricing.html` — Plans & Pricing (pulled live from your Supabase `subscription_plans` table)
- `dream-selection.html` — Dream Company & Role picker
- `interview.html` — Live AI interview (Vapi.ai)
- `dashboard.html` — Student score history
- `terms.html`, `privacy.html`, `security.html`, `status.html`, `community.html`, `docs.html`, `contact.html` — footer/legal pages
- `css/style.css` — shared design
- `js/` — all page logic

## Before this works, fill in 3 things

### 1. Supabase credentials — `js/supabase-config.js`
```js
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
```
Find these at: Supabase Dashboard → Project Settings → API.

### 2. Vapi.ai credentials — `js/interview.js`
```js
const VAPI_PUBLIC_KEY = "PASTE_YOUR_VAPI_PUBLIC_KEY_HERE";
const VAPI_ASSISTANT_ID = "PASTE_YOUR_VAPI_ASSISTANT_ID_HERE";
```
Find these at: vapi.ai dashboard → API Keys, and the Assistant you create there.

### 3. Instamojo payment links — `js/pricing.js`
```js
const INSTAMOJO_LINKS = {
  "Basic": "...",
  "Pro": "...",
  "Premium": "..."
};
```
Create one payment link per plan in your Instamojo dashboard and paste the URLs here.

## How to publish this for free (GitHub Pages)

1. Create a new repository on GitHub (e.g. `prepvida-website`).
2. Upload all these files/folders into it (GitHub's web UI lets you drag-and-drop files — no command line needed. Use "Add file" → "Upload files").
3. Go to the repo's **Settings** → **Pages**.
4. Under "Source", select the `main` branch and `/ (root)` folder → Save.
5. GitHub will give you a live URL like `https://yourusername.github.io/prepvida-website/`.
6. To use your own domain (prepvida.in), add a `CNAME` file in the root containing just your domain, and update your domain's DNS records to point to GitHub Pages (GitHub's Pages settings page shows the exact records to add).

## Important note on scoring automation

The scoreboard email-after-interview step needs a small server-side piece (a Supabase Edge Function triggered by a Vapi.ai webhook) since browser-only code can't securely process the AI's results and send emails on its own. That's the next piece to set up — ask for help building that Edge Function when you're ready.
