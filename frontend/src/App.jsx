import { useEffect, useState } from 'react';
import { onAuthChange, signInWithGoogle, signOut } from './firebase.js';
import { ensureUserDoc } from './lib/userStore.js';
import Login from './components/Login.jsx';
import Uploader from './components/Uploader.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Fire-and-forget — UI shouldn't block on this; failures are
        // logged so the user can still use the app even if Firestore
        // is briefly unavailable.
        ensureUserDoc(u).catch((err) => console.warn('ensureUserDoc failed:', err));
      }
    });
    return unsub;
  }, []);

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  if (!user) {
    return <Login onSignIn={signInWithGoogle} />;
  }

  return <Uploader user={user} onSignOut={signOut} />;
}
