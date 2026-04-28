import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { initAdmin, verifyIdToken } from './auth.js';

const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim());

initAdmin();

const app = express();

// CORS — allow Firebase Hosting domain to call the API
app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-mobie-api-key'],
  })
);

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  // Disable introspection in production for a small security gain
  introspection: process.env.NODE_ENV !== 'production',
});
await server.start();

app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req }) => {
      // Pull Bearer token from Authorization header and verify it
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      let user = null;
      if (match) {
        try {
          user = await verifyIdToken(match[1]);
        } catch (err) {
          // Leave user as null — resolvers will reject unauthenticated requests
          console.warn('Token verification failed:', err.message);
        }
      }
      // The user supplies their own Mobie API key per request.
      const mobieApiKey = req.headers['x-mobie-api-key'] || null;
      return { user, mobieApiKey };
    },
  })
);

app.listen(PORT, () => {
  console.log(`INGN API listening on :${PORT}`);
  console.log(`API_HOST=${process.env.API_HOST}`);
});
