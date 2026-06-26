'use client';

import { useState } from 'react';

export default function AuthPanel({ user, loading, onGoogleSignIn, onRegister, onLogin, onLogout }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        await onRegister(email, password);
        setMessage('Account created.');
      } else {
        await onLogin(email, password);
        setMessage('Signed in.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    }
  };

  if (loading) return <div className="auth-card">Loading…</div>;

  if (!user) {
    return (
      <div className="auth-card">
        <h3>Sign in</h3>
        <p>Use Google or email to unlock your binder.</p>
        <form onSubmit={submit}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <button type="submit">{mode === 'register' ? 'Create account' : 'Log in'}</button>
        </form>
        <button className="secondary-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Back to login'}
        </button>
        <button className="secondary-btn" onClick={onGoogleSignIn}>Continue with Google</button>
        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h3>Signed in</h3>
      <p>{user.email || user.displayName}</p>
      <button onClick={onLogout}>Sign out</button>
    </div>
  );
}
