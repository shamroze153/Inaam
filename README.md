# Inaam Sheermaal House: 3D website

A scroll-driven 3D restaurant site built with Three.js. Every bread, the
tandoor, the kulhad and the Nashta Box are generated in code, so the site
needs no image or 3D model files.

## Sections

| Section | What happens |
|---|---|
| Hero | A glazed sheermaal floats in ember light and follows the mouse |
| Kahani (story) | Scrolling rewinds the sheermaal to raw ingredients, then kneads the dough ball, rolls it flat, pricks it, bakes it over a clay tandoor and glazes it with saffron |
| Tandoor Lineup | A 3D carousel of 8 breads on a glowing pedestal. Scroll, drag, use the arrows or click a bread. *Tafseel dekhein* opens a detail view whose background takes that bread's colour |
| Shahi Nashta Box | Scrolling opens a branded box and lifts out the sheermaal, kulcha and kulhad chai |
| Menu | Cards with 3D-rendered thumbnails, category filter, add to order |
| Visit | Address, timings, WhatsApp |

Orders collect in a cart and are sent as a pre-filled WhatsApp message.

## View it

Open `dist/index.html` in a browser. It is a single self-contained file;
only the Google Fonts load from the internet.

## Edit content

Shop name, WhatsApp number, address, timings, prices and bread descriptions
are all in `src/data.js`. **The number, address, timings and prices are
placeholders. Replace them with the real details before going live.**

Then rebuild:

```bash
npm install
npm run build      # writes dist/index.html
npm run preview    # serves dist/ locally
```

## Deploy

Upload the `dist/` folder to any static host (Netlify drag-and-drop,
Vercel, GitHub Pages or Cloudflare Pages).

## Files

| File | Purpose |
|---|---|
| `src/data.js` | All editable content |
| `src/main.js` | Scene, scroll choreography, carousel, interaction |
| `src/parts.js` | Bread geometry, tandoor, kulhad, box, embers, background |
| `src/textures.js` | Procedural canvas textures (glaze, fork marks, seeds, char spots, box print) |
| `src/ui.js` | DOM: story steps, lineup labels, detail panel, menu, cart |
| `src/index.html`, `src/style.css` | Markup and styles |
| `build.mjs` | Bundles everything into `dist/index.html` |

On slow devices the site lowers its pixel ratio and turns off bloom
automatically. With `prefers-reduced-motion` set, it skips the intro and
marquee animations.
