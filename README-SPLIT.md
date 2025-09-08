# Split to client/ and server/

This project was prepared to be split without breaking imports.

Server files now auto-detect `client/`:
- `app.js` and `server.js` use `CLIENT_DIR` env var if set, otherwise they check `client/` beside them.
- They resolve:
  - `VIEWS_DIR = <CLIENT_DIR>/views` if it exists, otherwise `./views`
  - `PUBLIC_DIR = <CLIENT_DIR>/public` if it exists, otherwise `./public`

## What to move
Create two folders at repository root:

```
client/
  public/
  views/

server/
  app.js
  server.js (optional, if you use it)
  routes/
  middlewares/
  utils/
  templates/
  config/
  data/
```

Move files/directories accordingly:
- Frontend assets → `client/public/` (was `./public/`)
- EJS templates → `client/views/` (was `./views/`)
- Everything else (Node code) → `server/`.

> Note: imports inside code remain the same because they are relative within `server/` (e.g. `require("./routes/...")`). Only views/static paths are resolved dynamically.

## Run locally after split
From `server/`:

```
npm install
npm run dev
```

Open http://localhost:3000 or the port printed by the server.

If you want to be explicit, set:

```
CLIENT_DIR=../client
```

## Hostinger deployment
1. hPanel → Node.js → Create Application.
2. Application root: `/path/to/site/server`.
3. Start file: `app.js`.
4. Install dependencies.
5. Environment variables: add `CLIENT_DIR=../client` (optional; auto-detect works if `client/` sits next to `server/`).
6. Start the app and set App URL to your domain.

If your plan does not support Node.js, you must upgrade or use a VPS. Static `client/` alone will not run the backend.

## Notes
- Do not hardcode `PORT`. Hostinger injects `PORT` env; our code uses `process.env.PORT || 3200/3000`.
- `favicon` is served from `PUBLIC_DIR/icons/mango_32x32.png`.
