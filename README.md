# Srinath Blogs – Backend

Simple, clean, minimalist blog backend. Dark theme. Fast and small.

## What this is

- Node.js + Express + EJS
- Markdown posts with live preview
- Local uploads served from `/uploads/*`
- Admin (writer) console with drafts and publish
- Portfolio page at `/portfolio`

## Quick start

```bash
# 1) Install npm ci

# 2) Set env (copy/paste then edit)
cp .env .env.local  # optional

# 3) Run
npm start
# open http://localhost:3000/blogs
```

## Env vars

Create `.env` in this folder:

```
PORT=3000
SITE_URL=http://localhost:3000
ADMIN_PASSWORD=change-me           # or ADMIN_PASSWORD_HASH
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=myblogs
```

## Uploads

- Served by Express static from `public/`
- Public URL pattern: `/uploads/YYYY/MM/<file>`
- Production tip: use a persistent disk or S3 for durability

## Scripts

```bash
npm start        # start server
npm run dev      # with nodemon
```

## Deploy (minimal)

- Keep Node running with PM2
- Put Nginx in front (80/443 → 3000)
- Set `NODE_ENV=production` and `SITE_URL=https://yourdomain.com`

## Structure

```
src/
  app.js         # express app (thin)
  server.js      # start + shutdown
  routes/        # http routes
  controllers/   # page + api handlers
  utils/         # markdown, uploads, db, etc
views/          # ejs templates (dark theme)
public/         # static (images, uploads)
```

## License

MIT © Srinath Shrestha
