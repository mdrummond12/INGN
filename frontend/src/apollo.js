import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { auth } from './firebase.js';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL,
});

// Attach the Firebase ID token and (when present) the per-operation Mobie API key.
// Operations pass the Mobie key via Apollo's `context` option, e.g.:
//   useMutation(MUT, { context: { mobieApiKey: '...' } })
const authLink = setContext(async (_op, prevContext) => {
  const headers = { ...(prevContext.headers || {}) };

  const user = auth.currentUser;
  if (user) {
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }

  if (prevContext.mobieApiKey) {
    headers['x-mobie-api-key'] = prevContext.mobieApiKey;
  }

  return { headers };
});

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    mutate: { fetchPolicy: 'no-cache' },
    query: { fetchPolicy: 'no-cache' },
  },
});
