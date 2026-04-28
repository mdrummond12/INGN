# INGN — Segment Bulk Uploader

Bulk-upload card numbers or emails to a Mobie Ordering segment, secured by Google sign-in.

| Layer | Tech | Where it lives |
|---|---|---|
| Frontend | React + Vite + Apollo Client + Firebase Auth | Firebase Hosting |
| Backend  | Apollo Server + Express + Firebase Admin     | Firebase App Hosting (`ingn-api`) |
| Auth     | Firebase Auth — Google sign-in                | Firebase |
| Secrets  | Mobie API key                                 | Cloud Secret Manager (linked to App Hosting) |

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
   (Bearer ID token)                          ├─ verify Firebase ID token
                                              ├─ inject api_key from secret
                                              └─────────────────────────────► /api_campus/segment/adduser
```

The browser only ever sees the GraphQL endpoint. The Mobie API key is held server-side in Secret Manager and injected on each call. Unauthenticated GraphQL requests are rejected by `requireAuth()` in the resolvers.

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

### 3. Create the Mobie API key secret

App Hosting reads secrets through Cloud Secret Manager. Create one with the Firebase CLI:

```bash
cd backend
firebase apphosting:secrets:set mobie-api-key
# It prompts for the secret value — paste:
# 69FA38C4CE62A306C1B520868939684D07AB6DF4794F24A1D42C5FF34E23764A
```

This stores the secret and grants the App Hosting backend permission to read it. The reference in `apphosting.yaml` (`secret: mobie-api-key`) wires it up.

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
export API_KEY=your-mobie-api-key
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run dev
# → http://localhost:8080/graphql
```

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
