import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { auth } from './firebase.js';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL,
});

// Attach the current Firebase ID token to every GraphQL request.
const authLink = setContext(async (_op, { headers }) => {
  const user = auth.currentUser;
  if (!user) return { headers };
  const token = await user.getIdToken();
  return {
    headers: {
      ...headers,
      authorization: `Bearer ${token}`,
    },
  };
});

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    mutate: { fetchPolicy: 'no-cache' },
    query: { fetchPolicy: 'no-cache' },
  },
});
