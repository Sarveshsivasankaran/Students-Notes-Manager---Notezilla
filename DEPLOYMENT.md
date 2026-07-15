# Vercel frontend + Railway backend

This repository is configured to deploy the static files in `public/` to Vercel and the persistent Express/Socket.IO application to Railway.

## 1. Deploy the backend to Railway

1. Create a Railway project from this GitHub repository.
2. Railway will read `railway.json`, install production dependencies, start the service with `npm start`, and check `/api/health`.
3. Add the following Railway variables:

   ```env
   NODE_ENV=production
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   JWT_SECRET=replace-with-a-long-random-secret
   GEMINI_API_KEY=your-key-if-used
   OPENROUTER_API_KEY=your-key-if-used
   OPENROUTER_MODEL=meta-llama/llama-3-8b-instruct:free
   GOOGLE_DRIVE_ROOT_FOLDER_ID=your-folder-id
   FRONTEND_URL=https://your-project.vercel.app
   CORS_ORIGINS=https://your-custom-domain.example
   TIMETABLE_DIR=/app/data/timetables
   ```

   `CORS_ORIGINS` is optional and accepts a comma-separated list. Put the primary Vercel URL in `FRONTEND_URL`; add custom domains or specific preview URLs to `CORS_ORIGINS`.

4. Add a Railway volume mounted at `/app/data/timetables`. Without a volume, uploaded timetable images are lost when Railway replaces the container.
5. Generate a public Railway domain and confirm:

   ```text
   https://your-service.up.railway.app/api/health
   ```

Do not manually set `PORT`; Railway supplies it automatically.

## 2. Deploy the frontend to Vercel

1. Import the same GitHub repository into Vercel.
2. Set the framework preset to **Other**. The committed `vercel.json` runs `npm run build` and publishes `.dist`.
3. Add this Vercel environment variable for Production and Preview:

   ```env
   RAILWAY_BACKEND_URL=https://your-service.up.railway.app
   ```

4. Deploy. The build copies `public/` into `.dist`, injects the Railway URL into `runtime-config.js`, and validates local image, stylesheet, script, audio, and page paths with Linux-compatible filename casing.
5. Copy the final Vercel production URL into Railway's `FRONTEND_URL`, then redeploy Railway once so REST and Socket.IO CORS use the exact frontend origin.

## 3. Verify the production connection

- Open the Vercel landing page and confirm images and creator photos load.
- Open browser developer tools and confirm `/api/public/stats` is requested from the Railway domain.
- Sign in and confirm the dashboard establishes a Socket.IO connection to Railway.
- Run a Daily DSA sample and upload a timetable image.
- Redeploy Railway and confirm the timetable remains available, proving the volume is mounted correctly.

## Local development

`public/runtime-config.js` falls back to the current origin when no Railway URL has been injected, so the existing local workflow remains unchanged:

```bash
npm install
npm run dev
```

To test the static Vercel output locally:

```bash
$env:RAILWAY_BACKEND_URL="https://your-service.up.railway.app"
npm run build
npm run preview
```
