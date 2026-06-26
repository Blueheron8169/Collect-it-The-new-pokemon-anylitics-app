'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import AuthPanel from '../components/AuthPanel';
import PortfolioDashboard from '../components/PortfolioDashboard';

const fallbackCards = [
  {
    name: 'Pikachu V',
    set: 'Scarlet & Violet',
    number: '001/198',
    price: '$12.50',
    description: 'Popular promo card with strong collector demand.',
  },
  {
    name: 'Charizard ex',
    set: 'Obsidian Flames',
    number: '186/197',
    price: '$28.00',
    description: 'Fast-moving high-value staple for modern decks.',
  },
  {
    name: 'Umbreon VMAX',
    set: 'Evolving Skies',
    number: '054/203',
    price: '$18.75',
    description: 'A classic collector favorite with steady interest.',
  },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

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

  const handleSearch = async (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchMessage('Enter a card name to search.');
      return;
    }

    setSearchLoading(true);
    setSearchMessage('Searching for market matches…');

    try {
      const response = await fetch(`https://api.pokewallet.io/search?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error('Search unavailable');

      const data = await response.json();
      const items = Array.isArray(data) ? data : data.cards || [];
      const mapped = items.slice(0, 6).map((item) => ({
        name: item.name || item.cardName || query,
        set: item.setName || 'Unknown set',
        number: item.cardNumber || item.number || '—',
        price: item.marketValue || item.price || '$0.00',
        description: item.description || 'Market data returned from PokeWallet.',
      }));

      setSearchResults(mapped.length ? mapped : fallbackCards.slice(0, 3));
      setSearchMessage(mapped.length ? 'Live card matches found.' : 'No live matches were returned, so sample cards are shown.');
    } catch (error) {
      setSearchResults(fallbackCards.slice(0, 3));
      setSearchMessage('Live pricing is unavailable right now. Showing popular sample cards instead.');
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Free Pokémon TCG analytics</p>
          <h1>Collect It</h1>
          <p className="hero-copy">
            Scan cards, search the market, and build a smarter binder in one polished dashboard.
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

      <section className="search-card">
        <div className="search-header">
          <p className="eyebrow">Search cards</p>
          <h2>Find cards like a collector pro</h2>
          <p>Search by card name and number, then jump straight to live deal links.</p>
        </div>
        <form className="search-form" onSubmit={handleSearch}>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Try Pikachu, Charizard, Umbreon..."
          />
          <button type="submit" disabled={searchLoading}>{searchLoading ? 'Searching…' : 'Search'}</button>
        </form>
        {searchMessage ? <p className="muted-text">{searchMessage}</p> : null}
        <div className="result-grid">
          {searchResults.map((item) => {
            const dealUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.name)}+${encodeURIComponent(item.number)}&LH_BIN=1&sop=15`;
            return (
              <article className="result-item" key={`${item.name}-${item.number}`}>
                <div className="result-topline">
                  <strong>{item.name}</strong>
                  <span>{item.price}</span>
                </div>
                <p>{item.set} • {item.number}</p>
                <p className="result-description">{item.description}</p>
                <a href={dealUrl} target="_blank" rel="noreferrer">View eBay deal</a>
              </article>
            );
          })}
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
