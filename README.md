# INGN — Segment Bulk Uploader

Bulk-upload card numbers or emails to a Mobie Ordering segment, secured by Google sign-in.

| Layer | Tech | Where it lives |
|---|---|---|
| Frontend | React + Vite + Apollo Client + Firebase Auth | Firebase Hosting |
| Backend  | Apollo Server + Express + Firebase Admin     | Firebase App Hosting (`ingn-api`) |
| Auth     | Firebase Auth — Google sign-in                | Firebase |
| Mobie API key | Supplied by the user per session, sent on the `x-mobie-api-key` header. Future: stored encrypted in Firestore per user. | — |

```
INGN/
├── backend/                          → Firebase App Hosting backend (ingn-api)
│   ├── apphosting.yaml
│   ├── package.json
│   └── src/
│       ├── index.js                  Express + Apollo Server
│       ├── schema.js                 GraphQL typeDefs
│       ├── resolvers.js
│       ├── auth.js                   Firebase ID token verification
│       └── mobie.js                  Mobie API client (server-side key)
├── frontend/                         → Firebase Hosting (Vite build)
│   ├── package.json
│   ├── vite.config.js
│   ├── firebase.json
│   ├── .firebaserc
│   ├── .env.example
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── firebase.js               Firebase Auth init
│       ├── apollo.js                 Apollo Client w/ auth header
│       ├── styles.css
│       └── components/
│           ├── Login.jsx
│           └── Uploader.jsx
├── .github/workflows/
│   └── deploy-frontend.yml           Auto-deploy frontend on push
└── README.md
```

> **App Hosting auto-deploys** the backend through Firebase's built-in GitHub
> integration — no GitHub Actions workflow needed for the backend.

---

## Architecture

```
Browser                Firebase Hosting          Firebase App Hosting        Mobie API
─────────              ─────────────────         ─────────────────────       ─────────
React UI    ───────►   serves dist/         
Apollo Client ──────────────────────────►   Apollo Server (ingn-api)
   (Bearer ID token +                          ├─ verify Firebase ID token
    x-mobie-api-key)                           ├─ forward api_key to Mobie
                                              └─────────────────────────────► /api_campus/segment/adduser
```

The browser sends the Firebase ID token (auth) plus the user's Mobie API key on each GraphQL request. The backend verifies the ID token, then forwards the Mobie key to the upstream API. Unauthenticated GraphQL requests are rejected by `requireAuth()` in the resolvers.

---

## One-time setup

### 1. Firebase project

Create or pick a project at https://console.firebase.google.com.

Then enable:
- **Authentication** → Sign-in providers → Google → Enable
- **Hosting** (for the frontend)
- **App Hosting** (for the backend)

### 2. Update placeholders

- `frontend/.firebaserc` — set `default` to your Firebase project ID
- `backend/apphosting.yaml` — set `FIREBASE_PROJECT_ID` to your project ID

### 3. Mobie API key

The user supplies their own key in the UI; the frontend forwards it as the `x-mobie-api-key` header on each GraphQL request. Nothing to configure server-side. (A future iteration will let signed-in users save the key encrypted to their Firestore record so they don't have to paste it every session.)

### 4. Push to GitHub (`INGN` repo)

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/INGN.git
git push -u origin main
```

### 5. Connect App Hosting to your GitHub repo

In the Firebase console:

1. Go to **App Hosting → Create backend**
2. Backend ID: `ingn-api`
3. Region: `us-central1`
4. Connect to GitHub → select the `INGN` repo
5. Live branch: `main`
6. **Root directory: `backend`** ← important
7. Click Create

App Hosting will detect `apphosting.yaml`, build the Node app, and start serving. The URL appears in the console once it's live (it'll look like `https://ingn-api--<project>.us-central1.hosted.app`).

> From here on, every push to `main` that changes anything in `backend/`
> triggers a new App Hosting rollout automatically.

### 6. Configure GitHub secrets for the frontend workflow

In **github.com/YOUR-ORG/INGN → Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT` | JSON contents of a Firebase service account key (Firebase console → Project Settings → Service accounts → Generate new private key) |
| `VITE_FIREBASE_API_KEY` | Web API key (Project Settings → General → Your apps) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Web app ID (Project Settings → General → Your apps) |
| `VITE_GRAPHQL_URL` | App Hosting URL + `/graphql`, e.g. `https://ingn-api--your-project.us-central1.hosted.app/graphql` |

> The `VITE_*` values are public (they ship in the JS bundle). They're stored as
> secrets only so each environment can have its own; security comes from
> Firebase Auth + the backend's token verification, not from hiding them.

### 7. Authorize the Firebase Hosting domain

In Firebase Console → **Authentication → Settings → Authorized domains**, make sure `<project>.web.app` and `<project>.firebaseapp.com` are listed (they're added by default).

### 8. Tighten CORS (after the frontend is live)

Edit `backend/apphosting.yaml` and replace `ALLOWED_ORIGINS` with your real Firebase Hosting domain:

```yaml
- variable: ALLOWED_ORIGINS
  value: "https://your-project.web.app,https://your-project.firebaseapp.com"
```

Push to main — App Hosting will redeploy with the new value.

---

## Day-to-day workflow

| Change | Auto-deploys to |
|---|---|
| Anything in `frontend/**` | Firebase Hosting (via GitHub Actions) |
| Anything in `backend/**` | Firebase App Hosting (via Firebase's built-in integration) |
| Both | Both, in parallel |

---

## Local development

### Backend

```bash
cd backend
npm install
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run dev
# → http://localhost:8080/graphql
```

The Mobie API key is supplied per-request by the frontend, so no `API_KEY` env var is needed locally either.

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local — for local dev, set VITE_GRAPHQL_URL=http://localhost:8080/graphql
npm install
npm run dev
# → http://localhost:5173
```

---

## GraphQL API

```graphql
type Query {
  me: User
}

type Mutation {
  addToSegment(input: SegmentEntryInput!): SegmentResult!
  removeFromSegment(input: SegmentEntryInput!): SegmentResult!
}

input SegmentEntryInput {
  conditionId: Int!
  value: String!
}

type SegmentResult {
  success: Boolean!
  status: Int!
  message: String
  raw: String
}
```

All operations require a valid Firebase ID token in the `Authorization: Bearer <token>` header. The Apollo Client `authLink` adds it automatically.
