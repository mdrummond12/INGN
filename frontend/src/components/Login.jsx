export default function Login({ onSignIn }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>⬡ INGN Segment Uploader</h1>
        <p>Sign in with your Google account to continue.</p>
        <button className="btn btn-primary login-btn" onClick={onSignIn}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
