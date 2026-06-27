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
        <h3>{mode === 'register' ? 'Create a free account' : 'Sign in'}</h3>
        <p className="muted-text" style={{ marginTop: 0, fontSize: '0.9rem' }}>
          {mode === 'register'
            ? 'Email and password signup takes less than a minute.'
            : 'Sign in to sync your binder across devices.'}
        </p>
        <form onSubmit={submit}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" minLength={6} required />
          <button type="submit">{mode === 'register' ? 'Create account' : 'Log in'}</button>
        </form>
        <button className="secondary-btn" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Sign up free' : 'Already have an account? Log in'}
        </button>
        <button className="secondary-btn" type="button" onClick={onGoogleSignIn}>Continue with Google</button>
        <p className="muted-text" style={{ fontSize: '0.82rem', marginBottom: 0 }}>
          No account needed. Cards save to this device automatically.
        </p>
        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h3>Signed in</h3>
      <p className="muted-text" style={{ marginTop: 0 }}>{user.email || user.displayName}</p>
      <button type="button" onClick={onLogout}>Sign out</button>
    </div>
  );
}
