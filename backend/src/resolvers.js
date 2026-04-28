import { GraphQLError } from 'graphql';
import { callMobieSegment } from './mobie.js';

function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
}

export const resolvers = {
  Query: {
    me: (_p, _a, ctx) => {
      if (!ctx.user) return null;
      return {
        uid: ctx.user.uid,
        email: ctx.user.email || null,
        displayName: ctx.user.name || null,
      };
    },
  },

  Mutation: {
    addToSegment: async (_p, { input }, ctx) => {
      requireAuth(ctx);
      return callMobieSegment('adduser', input);
    },

    removeFromSegment: async (_p, { input }, ctx) => {
      requireAuth(ctx);
      return callMobieSegment('removeuser', input);
    },
  },
};
