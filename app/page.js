'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import AuthPanel from '../components/AuthPanel';
import PortfolioDashboard from '../components/PortfolioDashboard';

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function HomePage() {
  const { user, loading, loginWithGoogle, register, login, logout } = useAuth();
  const [cards, setCards] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    if (!user) {
      setCards([]);
      return;
    }

    const q = query(collection(db, 'users', user.uid, 'binder'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const nextCards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setCards(nextCards);
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!selectedFile || !user) {
      setScanError('Select an image and sign in first.');
      return;
    }

    setIsScanning(true);
    setScanError('');
    setScanMessage('Scanning your card with Gemini…');

    try {
      const base64 = await toBase64(selectedFile);
      const scanResponse = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: selectedFile.type || 'image/jpeg',
        }),
      });

      const scanData = await scanResponse.json();
      const marketResponse = await fetch('/api/pokewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${scanData.cardName} ${scanData.cardNumber}` }),
      });
      const marketData = await marketResponse.json();

      const payload = {
        ...scanData,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        estimatedValue: marketData.marketEstimate || 0,
        priceData: marketData.priceData || [],
      };

      await addDoc(collection(db, 'users', user.uid, 'binder'), payload);
      setScanMessage(`Saved ${scanData.cardName || 'your card'} to your binder.`);
    } catch (error) {
      setScanError(error.message || 'Scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const totalNetWorth = useMemo(() => {
    return cards.reduce((sum, card) => sum + Number(card.estimatedValue || 0), 0);
  }, [cards]);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Free Pokémon TCG analytics</p>
          <h1>Collect It</h1>
          <p className="hero-copy">
            Scan cards, gather pricing data, and build a live binder with a free AI-assisted workflow.
          </p>
        </div>
        <div className="hero-actions">
          <AuthPanel
            user={user}
            loading={loading}
            onGoogleSignIn={loginWithGoogle}
            onRegister={register}
            onLogin={login}
            onLogout={logout}
          />
        </div>
      </section>

      <section className="scan-panel">
        <div className="scan-card">
          <h2>AI card scan</h2>
          <p>Upload a photo to extract card metadata, condition, and market context.</p>
          <label className="upload-button">
            <span>{selectedFile ? selectedFile.name : 'Choose card photo'}</span>
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </label>

          {previewUrl ? <img src={previewUrl} alt="Selected card preview" className="preview-image" /> : null}

          <button className="primary-btn" onClick={handleScan} disabled={isScanning || !user}>
            {isScanning ? 'Scanning…' : 'Scan & save card'}
          </button>

          {scanMessage ? <p className="success-text">{scanMessage}</p> : null}
          {scanError ? <p className="error-text">{scanError}</p> : null}
        </div>

        <PortfolioDashboard cards={cards} totalNetWorth={totalNetWorth} />
      </section>
    </main>
  );
}
