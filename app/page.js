'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import AuthPanel from '../components/AuthPanel';
import PortfolioDashboard from '../components/PortfolioDashboard';
import BrandLogo from '../components/BrandLogo';
import CameraCapture from '../components/CameraCapture';
import { buildFallbackCard, buildSearchResults, formatCurrency } from '../lib/cardUtils';

function getDateValue(raw) {
  if (!raw) return 0;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCard(docLike) {
  const price = Number(docLike.estimatedValue || 0);
  const quantity = Math.max(1, Number(docLike.quantity || 1));
  return {
    ...docLike,
    quantity,
    purchasePrice: Number(docLike.purchasePrice || 0),
    estimatedValue: Number.isFinite(price) ? price : 0,
  };
}

function readLocalBinder() {
  if (typeof window === 'undefined') return [];

  try {
    const localCards = window.localStorage.getItem('collect-it-local-binder');
    if (!localCards) return [];

    const parsed = JSON.parse(localCards);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Local binder hydration failed:', error);

    try {
      window.localStorage.removeItem('collect-it-local-binder');
    } catch {
      // Ignore preview environments that block storage writes.
    }

    return [];
  }
}

function writeLocalBinder(cards) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem('collect-it-local-binder', JSON.stringify(cards));
  } catch (error) {
    console.error('Local binder persistence failed:', error);
  }
}

async function optimizeImageForScan(file) {
  if (typeof createImageBitmap !== 'function') {
    const direct = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return {
      mimeType: file.type || 'image/jpeg',
      base64: String(direct).split(',')[1],
    };
  }

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1300;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, 0.82);
  return {
    mimeType,
    base64: dataUrl.split(',')[1],
  };
}

export default function HomePage() {
  const { user, loading, loginWithGoogle, register, login, logout } = useAuth();
  const [cards, setCards] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanInsight, setScanInsight] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(() => buildSearchResults(''));
  const [searchMessage, setSearchMessage] = useState('Try a card name to preview fresh market values.');
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualSet, setManualSet] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQuantity, setManualQuantity] = useState('1');
  const [manualCost, setManualCost] = useState('');
  const [showManualOverrides, setShowManualOverrides] = useState(false);
  const [activeTab, setActiveTab] = useState('discover');
  const [showCamera, setShowCamera] = useState(false);
  const [identifyQuery, setIdentifyQuery] = useState('');
  const [identifyResults, setIdentifyResults] = useState([]);
  const [identifyLoading, setIdentifyLoading] = useState(false);

  // Mirror cards in a ref so auth-transition effects can always read the latest value
  // even if the state update hasn't flushed yet.
  const cardsRef = useRef([]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // On logout: save whatever cards are in memory (cloud cards) to localStorage
      // so the user's portfolio is not wiped when they sign out.
      const current = cardsRef.current;
      if (current.length > 0) writeLocalBinder(current);

      const parsed = readLocalBinder();
      const normalized = parsed.map(normalizeCard).sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));
      setCards(normalized);
      return;
    }

    // On login: cloud Firestore is the source of truth. Clear local storage so
    // guest cards from a different session don't pollute the cloud binder.
    writeLocalBinder([]);

    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'binder'),
      (snapshot) => {
        const nextCards = snapshot.docs
          .map((doc) => normalizeCard({ id: doc.id, ...doc.data() }))
          .sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));
        setCards(nextCards);
      },
      (error) => {
        console.error('Binder snapshot failed:', error);
        setScanError('Could not load cloud binder. Your cards are still visible locally.');
      },
    );

    return () => unsubscribe();
  }, [user, loading]);

  // Persist guest (logged-out) cards to localStorage whenever they change.
  useEffect(() => {
    if (user || loading) return;
    writeLocalBinder(cards);
  }, [cards, user, loading]);

  // Live card identify: debounced search as user types in the Scan tab.
  useEffect(() => {
    const trimmed = identifyQuery.trim();
    if (trimmed.length < 2) { setIdentifyResults([]); return; }
    const timer = setTimeout(async () => {
      setIdentifyLoading(true);
      try {
        const res = await fetch('/api/pokewallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: trimmed }),
        });
        const data = await res.json();
        setIdentifyResults((data.results || []).slice(0, 6));
      } catch { setIdentifyResults([]); }
      setIdentifyLoading(false);
    }, 380);
    return () => clearTimeout(timer);
  }, [identifyQuery]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setScanError('');
    setScanMessage('');
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (file, url) => {
    setSelectedFile(file);
    setPreviewUrl(url);
    setScanError('');
    setScanMessage('');
  };

  const handleIdentifySelect = async (tcgCard) => {
    const payload = {
      cardName: tcgCard.name,
      setName: tcgCard.set,
      cardNumber: tcgCard.number,
      estimatedValue: Number(tcgCard.priceValue || 0),
      imageUrl: tcgCard.imageUrl,
      estimatedCondition: 'Near Mint',
      centeringAnalysis: 'Identified from live TCG database.',
      edgeWear: 'Unknown',
      source: 'identified',
      quantity: 1,
      purchasePrice: 0,
      priceData: [{ label: tcgCard.set, value: Number(tcgCard.priceValue || 0) }],
    };
    try {
      await addCardToCollection(payload);
      setScanInsight(payload);
      setScanMessage(`✔ Added ${tcgCard.name} to your binder!`);
      setIdentifyQuery('');
      setIdentifyResults([]);
      setPreviewUrl('');
      setSelectedFile(null);
      setActiveTab('portfolio');
    } catch (error) {
      setScanError(error.message || 'Could not add card.');
    }
  };

  const addCardToCollection = async (payload) => {
    const normalized = normalizeCard(payload);
    if (user) {
      const optimisticId = `local-${Date.now()}`;
      setCards((current) => [{ ...normalized, id: optimisticId, createdAt: new Date().toISOString() }, ...current]);

      const ref = await addDoc(collection(db, 'users', user.uid, 'binder'), {
        ...normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCards((current) => current.map((card) => (card.id === optimisticId ? { ...card, id: ref.id } : card)));
      return ref.id;
    }

    setCards((current) => [{ ...normalized, createdAt: new Date().toISOString() }, ...current]);
    return null;
  };

  const handleRemoveCard = async (cardId) => {
    if (!cardId) return;

    const previous = cards;
    setCards((current) => current.filter((card) => card.id !== cardId));

    try {
      if (user && !String(cardId).startsWith('local-')) {
        await deleteDoc(doc(db, 'users', user.uid, 'binder', cardId));
      }
    } catch (error) {
      setCards(previous);
      setScanError('Could not remove card. Please try again.');
    }
  };

  const handleScan = async () => {
    if (!selectedFile) {
      setScanError('Choose a card photo first.');
      return;
    }

    setIsScanning(true);
    setScanError('');
    setScanMessage('Analyzing your card image…');

    try {
      const optimized = await optimizeImageForScan(selectedFile);
      const scanResponse = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: optimized.base64,
          mimeType: optimized.mimeType,
        }),
      });
      if (!scanResponse.ok) throw new Error('Card scan failed.');

      const scanData = await scanResponse.json();
      const fallbackCard = buildFallbackCard(selectedFile.name, {
        name: manualName || scanData.cardName,
        set: manualSet || scanData.setName,
        number: manualNumber || scanData.cardNumber,
        price: manualPrice || scanData.estimatedValue,
      });

      const marketResponse = await fetch('/api/pokewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${fallbackCard.cardName} ${fallbackCard.cardNumber}` }),
      });
      const marketData = await marketResponse.json();
      // Pick the first TCG result that has a real price — use that for value and image.
      const tcgCard = marketData.results?.find((r) => Number(r.priceValue || 0) > 0) || marketData.results?.[0];

      const payload = {
        ...fallbackCard,
        source: scanData.source || 'fallback',
        createdAt: new Date().toISOString(),
        estimatedValue: Number(tcgCard?.priceValue || marketData.marketEstimate || fallbackCard.estimatedValue || 0),
        imageUrl: tcgCard?.imageUrl || undefined,
        priceData: marketData.priceData?.length ? marketData.priceData : fallbackCard.priceData,
        estimatedCondition: scanData.estimatedCondition || fallbackCard.estimatedCondition,
        quantity: Math.max(1, Number(manualQuantity || 1)),
        purchasePrice: Number(manualCost || 0),
      };

      setScanInsight(payload);
      setManualName(payload.cardName || '');
      setManualSet(payload.setName || '');
      setManualNumber(payload.cardNumber || '');
      setManualPrice(String(payload.estimatedValue || ''));

      await addCardToCollection(payload);
      setScanMessage(`Saved ${payload.cardName} to your binder.`);
      setActiveTab('portfolio');
    } catch (error) {
      setScanError(error.message || 'Card scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const totalNetWorth = useMemo(() => {
    return cards.reduce((sum, card) => sum + Number(card.estimatedValue || 0) * Number(card.quantity || 1), 0);
  }, [cards]);

  const totalCostBasis = useMemo(() => {
    return cards.reduce((sum, card) => sum + Number(card.purchasePrice || 0) * Number(card.quantity || 1), 0);
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
    setSearchMessage('Checking live market listings…');

    try {
      const response = await fetch('/api/pokewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query }),
      });

      const marketData = await response.json();
      const mapped = (marketData.results || []).map((card) => ({
        name: card.name,
        set: card.set,
        number: card.number,
        price: card.price,
        priceValue: Number(card.priceValue || 0),
        description: card.description,
        imageUrl: card.imageUrl,
      }));

      setSearchResults(mapped.length ? mapped : buildSearchResults(query));
      setSearchMessage(
        marketData.fallback
          ? 'Showing dependable fallback results for that card name.'
          : `Found ${mapped.length} matching cards from live Pokemon TCG data.`,
      );
    } catch (error) {
      setSearchResults(buildSearchResults(query));
      setSearchMessage('Pricing service is unavailable, so sample cards were shown.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddSearchResult = async (result) => {
    const payload = {
      cardName: result.name,
      setName: result.set,
      cardNumber: result.number,
      estimatedValue: Number(result.priceValue || result.price || 0),
      estimatedCondition: 'Market Listed',
      centeringAnalysis: 'Imported from live market discovery.',
      edgeWear: 'Unknown',
      source: 'search-import',
      quantity: 1,
      purchasePrice: 0,
      createdAt: new Date().toISOString(),
      priceData: [{ label: 'Live market', value: Number(result.priceValue || result.price || 0) }],
    };

    try {
      await addCardToCollection(payload);
      setScanMessage(`Added ${result.name} to your binder.`);
      setActiveTab('portfolio');
    } catch (error) {
      setScanError(error.message || 'Could not add card from search.');
    }
  };

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <BrandLogo />
          <p className="eyebrow">Pokemon-focused collectr style tracking</p>
          <h1>Track your binder like a serious vault</h1>
          <p className="hero-copy">
            Discover live prices, scan cards with AI, and monitor gain/loss on every Pokemon card in one modern dashboard.
          </p>
          <div className="hero-kpis">
            <div>
              <span>Collection Value</span>
              <strong>{formatCurrency(totalNetWorth)}</strong>
            </div>
            <div>
              <span>Cost Basis</span>
              <strong>{formatCurrency(totalCostBasis)}</strong>
            </div>
            <div>
              <span>Tracked Cards</span>
              <strong>{cards.length}</strong>
            </div>
          </div>
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

      <div className="tab-row" role="tablist" aria-label="Main sections">
        <button type="button" className={`tab-btn ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>Discover</button>
        <button type="button" className={`tab-btn ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>Scan</button>
        <button type="button" className={`tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>Portfolio</button>
      </div>

      {activeTab === 'discover' ? (
        <section className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Discover cards</p>
              <h2>Find cards fast</h2>
            </div>
            <p className="panel-copy">Search by name and preview a price estimate without leaving the page.</p>
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
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="card-image" /> : null}
                  <div className="result-body">
                    <div className="result-topline">
                      <strong>{item.name}</strong>
                      <span className="result-price">{item.price}</span>
                    </div>
                    <p>{item.set} • {item.number}</p>
                    <p className="result-description">{item.description}</p>
                    <div className="result-actions">
                      <button type="button" className="secondary-cta" onClick={() => handleAddSearchResult(item)}>+ Add</button>
                      <a href={dealUrl} target="_blank" rel="noreferrer">eBay →</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === 'scan' ? (
        <section className="panel-card">
          <p className="eyebrow">Scan &amp; add</p>
          <h2 style={{ margin: '0 0 6px' }}>Add a card to your binder</h2>
          <p className="panel-copy">Take a photo or upload one, then type the card name to instantly find it in the live TCG database with the real price.</p>

          <div className="scan-photo-row">
            <div className="scan-preview-box">
              {previewUrl
                ? <img src={previewUrl} alt="Card preview" className="scan-preview-img" />
                : <div className="scan-preview-empty"><span style={{ fontSize: '2rem' }}>📷</span><span>Photo preview</span></div>
              }
            </div>
            <div className="scan-upload-col">
              <label className="upload-button">
                <span>📁 Choose photo</span>
                <input type="file" accept="image/*" onChange={handleFileChange} />
              </label>
              <button type="button" className="upload-button camera-btn" onClick={() => setShowCamera(true)}>
                📷 Use camera
              </button>
              {previewUrl ? (
                <button type="button" className="secondary-cta" onClick={() => { setPreviewUrl(''); setSelectedFile(null); }}>Clear</button>
              ) : null}
            </div>
          </div>

          {showCamera ? (
            <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
          ) : null}

          <div className="identify-panel">
            <label className="identify-label">Name this card</label>
            <div className="identify-input-row">
              <input
                className="identify-input"
                value={identifyQuery}
                onChange={(e) => setIdentifyQuery(e.target.value)}
                placeholder="e.g. Charizard ex, Pikachu V, Umbreon VMAX…"
                autoComplete="off"
              />
              {identifyLoading ? <span className="identify-spinner">Searching…</span> : null}
            </div>
            {identifyResults.length > 0 ? (
              <div className="identify-list">
                {identifyResults.map((card) => (
                  <button
                    key={`${card.name}-${card.number}`}
                    type="button"
                    className="identify-item"
                    onClick={() => handleIdentifySelect(card)}
                  >
                    {card.imageUrl ? <img src={card.imageUrl} alt={card.name} className="identify-img" /> : null}
                    <div className="identify-info">
                      <strong>{card.name}</strong>
                      <span>{card.set} · {card.number}</span>
                      <span>{card.description}</span>
                    </div>
                    <span className="identify-price">{card.price}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <details className="advanced-scan">
            <summary>Advanced: AI image scan (requires GEMINI_API_KEY in .env)</summary>
            <div className="manual-grid" style={{ marginTop: 12 }}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Card name override" />
              <input value={manualSet} onChange={(e) => setManualSet(e.target.value)} placeholder="Set override" />
              <input value={manualNumber} onChange={(e) => setManualNumber(e.target.value)} placeholder="Number override" />
              <input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Price override" />
              <input value={manualQuantity} onChange={(e) => setManualQuantity(e.target.value)} placeholder="Quantity" />
              <input value={manualCost} onChange={(e) => setManualCost(e.target.value)} placeholder="Your cost" />
            </div>
            <button className="primary-btn" onClick={handleScan} disabled={isScanning} style={{ marginTop: 12 }}>
              {isScanning ? 'Scanning…' : 'AI scan & add'}
            </button>
          </details>

          {scanMessage ? <p className="success-text" style={{ marginTop: 14 }}>{scanMessage}</p> : null}
          {scanError ? <p className="error-text" style={{ marginTop: 14 }}>{scanError}</p> : null}
        </section>
      ) : null}

      {activeTab === 'portfolio' ? (
        <section className="panel-card">
          <PortfolioDashboard
            cards={cards}
            totalNetWorth={totalNetWorth}
            totalCostBasis={totalCostBasis}
            onRemoveCard={handleRemoveCard}
          />
        </section>
      ) : null}
    </main>
  );
}
