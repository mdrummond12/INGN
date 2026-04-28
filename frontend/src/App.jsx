import { useEffect, useState } from 'react';
import { onAuthChange, signInWithGoogle, signOut } from './firebase.js';
import Login from './components/Login.jsx';
import Uploader from './components/Uploader.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
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
