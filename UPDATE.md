# UPDATE.md — tvvbali.com Mobile Performance Fixes

**Priority:** High  
**Trigger:** Instagram ad traffic showing ~44% bounce rate due to slow mobile load times  
**Source:** Google PageSpeed Insights + real-world user reports (Europe 4G, ~4s TTFB)

---

## Current Scores (Mobile)

| Page | Score | Status |
|---|---|---|
| Homepage (`/`) | 75/100 | Needs improvement |
| Direct Booking (`/direct-booking`) | 54/100 | Poor ❌ |

### Key Failing Metrics on `/direct-booking`

| Metric | Estimated Current | Target |
|---|---|---|
| First Contentful Paint (FCP) | ~5–6s | < 1.8s |
| Largest Contentful Paint (LCP) | ~5–6s | < 2.5s |
| Total Page Payload | > 5MB | < 1.5MB ideally |

---

## Tasks

### 1. Image Optimisation (Highest Impact)
- [ ] Convert all images to **WebP** format (fallback: JPEG for older browsers)
- [ ] Add `width` and `height` attributes to all `<img>` tags to prevent layout shift
- [ ] Implement **lazy loading** on all below-the-fold images (`loading="lazy"`)
- [ ] Set the **hero/LCP image** to `loading="eager"` and add `fetchpriority="high"`
- [ ] Compress all images — target under 150KB each, hero under 200KB
- [ ] Use responsive images with `srcset` for different screen sizes

### 2. Reduce Total Page Payload
- [ ] Audit and remove unused CSS (check for large framework imports)
- [ ] Audit and remove unused JavaScript
- [ ] Enable **Gzip or Brotli compression** on the server/CDN
- [ ] Minify all CSS, JS, and HTML files

### 3. Critical Rendering Path (FCP Fix)
- [ ] Inline critical CSS directly in `<head>` for above-the-fold content
- [ ] Defer or async all non-critical JavaScript (`<script defer>` or `<script async>`)
- [ ] Remove or defer any **render-blocking resources** flagged by PageSpeed
- [ ] Preload the LCP image using `<link rel="preload" as="image">`

### 4. Caching & CDN
- [ ] Confirm static assets (images, CSS, JS) are served with long **cache-control headers** (e.g. `max-age=31536000`)
- [ ] Verify the site is behind a **CDN** (Cloudflare recommended) — this is the main reason European 4G users see ~4s load vs Singapore users seeing fast loads
- [ ] Enable CDN edge caching for HTML pages too, not just static assets

### 5. Font Loading
- [ ] Add `font-display: swap` to all `@font-face` declarations
- [ ] Preload key font files: `<link rel="preload" as="font">`
- [ ] Reduce number of font weights/variants loaded — only load what's actually used

### 6. Third-Party Scripts (Common Culprits)
- [ ] Audit all third-party scripts: chat widgets, analytics, booking plugins, pixel trackers
- [ ] Load non-critical third-party scripts with `defer` or after user interaction
- [ ] Consider loading Meta Pixel / Google Analytics asynchronously and only after page load

### 7. `/direct-booking` Page Specifically
This page scores 54/100 and is the conversion destination for the Instagram ads — it needs the most urgent attention.
- [ ] Check if a heavy booking widget or iframe is loading synchronously
- [ ] If using an embedded booking system (e.g. Beds24, Bokun, Lodgify), check if it can be lazy-loaded or replaced with a lightweight form that calls the API
- [ ] Remove any animations or heavy UI libraries not essential to booking flow

---

## Suggested Priority Order

1. **Images** — likely responsible for the majority of the 5MB+ payload
2. **CDN setup** — single biggest fix for the Europe vs Singapore speed gap
3. **Defer JS / inline critical CSS** — will directly improve FCP and LCP numbers
4. **Booking widget audit** — likely the reason `/direct-booking` scores 20 points lower than homepage

---

## How to Verify Fixes

After each change, re-test using:
- [PageSpeed Insights](https://pagespeed.web.dev/) — mobile tab, test `/direct-booking`
- [WebPageTest](https://www.webpagetest.org/) — set location to **Frankfurt, Germany**, connection **4G**
- Target: `/direct-booking` score above **80/100** and LCP under **2.5s**

---

## Notes

- The performance gap between Singapore and European users is a **geographic latency + no CDN** issue, not a code issue alone. A CDN with European edge nodes (Cloudflare free tier works) will close most of that gap immediately.
- The 44% ad drop-off is a direct revenue loss — each 1s improvement in LCP typically recovers 5–10% of mobile conversions.