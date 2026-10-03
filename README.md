# Website Mandiri — Ikhbal Alhuzaibi

Standalone version of the personal creator-hub website, ready to deploy on
**Netlify (free)** with a **Decap CMS admin panel** so products can be
added, edited, and deleted without coding.

## What's inside

| File | Purpose |
|---|---|
| `index.html` | The website (same dark-premium design). The Digital Products section is rendered from `products.json` at page load; if the file can't be fetched, the two built-in product cards stay visible. |
| `products.json` | Product data (`{"products": [...]}`). Edited via the admin panel or by hand. |
| `ebook-cover.webp`, `journal-orangutan.webp` | Site images (flat root layout). CMS uploads go to `uploads/`. |
| `admin.html` | Admin login page (not linked from the public nav — open `/admin.html`). Decap CMS config is inlined via `CMS.init()` (no separate `config.yml`). |
| `netlify.toml` | Netlify settings: publish directory is `.`, no build step. |

## Deploy steps (needs the owner's hands)

1. **GitHub** — create a new repository (e.g. `website-ikhbal`), upload/push
   this whole folder, default branch `main`.
2. **Netlify** — log in at netlify.com → *Add new site* → *Import an existing
   project* → connect the GitHub repo. Build settings are automatic
   (`netlify.toml` already sets publish dir to `.`). Deploy.
3. **Enable Identity** — in Netlify: *Site settings* → *Identity* → *Enable
   Identity*.
4. **Enable Git Gateway** — *Site settings* → *Identity* → *Services* →
   *Enable Git Gateway* (lets the CMS commit `products.json` changes).
5. **Invite yourself** — *Identity* tab → *Invite users* → enter your email →
   accept the invite and set a password.
6. **Manage products** — open `https://<your-site>/admin.html`, log in, edit the
   *Products* collection: add / edit / delete products, upload covers.
   Every save commits to GitHub and Netlify redeploys automatically.

## Notes

- The site is fully static — hosting stays free on Netlify's free tier.
- `products.json` uses a `{"products": [...]}` wrapper (required by Decap
  CMS); the site's script also accepts a bare array.
- Products without an image get an automatic monogram tile.
- To use a custom domain later: Netlify → *Domain settings* → *Add custom
  domain* (domain purchase is separate and not free).
