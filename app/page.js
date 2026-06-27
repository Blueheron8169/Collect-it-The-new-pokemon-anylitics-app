'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import AuthPanel from '../components/AuthPanel';
import BrandLogo from '../components/BrandLogo';
import PortfolioDashboard from '../components/PortfolioDashboard';
import CameraCapture from '../components/CameraCapture';
import { buildFallbackCard, buildSearchResults, formatCurrency } from '../lib/cardUtils';
import { buildEbaySearchUrl } from '../lib/affiliateLinks';

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
  } catch {
    return [];
  }
}

function writeLocalBinder(cards) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem('collect-it-local-binder', JSON.stringify(cards));
  } catch {
    // Ignore storage write failures in restricted environments.
  }
}

function pickBestCardMatch(results, preferredNumber = '') {
  if (!Array.isArray(results) || !results.length) return null;
  const normalizedNumber = String(preferredNumber || '').trim().toLowerCase();
  if (!normalizedNumber) {
    return results.find((item) => Number(item.priceValue || 0) > 0) || results[0];
  }

  const exactNumberMatch = results.find((item) => String(item.number || '').toLowerCase() === normalizedNumber);
  if (exactNumberMatch) return exactNumberMatch;

  const looseMatch = results.find((item) => String(item.number || '').toLowerCase().includes(normalizedNumber));
  if (looseMatch) return looseMatch;

  return results.find((item) => Number(item.priceValue || 0) > 0) || results[0];
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
  const [activeTab, setActiveTab] = useState('discover');
  const [showCamera, setShowCamera] = useState(false);
  const [identifyQuery, setIdentifyQuery] = useState('');
  const [identifyResults, setIdentifyResults] = useState([]);
  const [identifyLoading, setIdentifyLoading] = useState(false);

  const cardsRef = useRef([]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const current = cardsRef.current;
      if (current.length > 0) writeLocalBinder(current);

      const parsed = readLocalBinder();
      const normalized = parsed.map(normalizeCard).sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));
      setCards(normalized);
      return;
    }

    writeLocalBinder([]);

    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'binder'),
      (snapshot) => {
        const nextCards = snapshot.docs
          .map((entry) => normalizeCard({ id: entry.id, ...entry.data() }))
          .sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));
        setCards(nextCards);
      },
      () => {
        setScanError('Could not load cloud binder. Your local cards are still available.');
      },
    );

    return () => unsubscribe();
  }, [user, loading]);

  useEffect(() => {
    if (user || loading) return;
    writeLocalBinder(cards);
  }, [cards, user, loading]);

  useEffect(() => {
    const trimmed = identifyQuery.trim();
    if (trimmed.length < 2) {
      setIdentifyResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIdentifyLoading(true);
      try {
        const res = await fetch('/api/pokewallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: trimmed }),
        });
        const data = await res.json();
        setIdentifyResults(data.results || []);
      } catch {
        setIdentifyResults([]);
      }
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
      setScanMessage(`Added ${tcgCard.name} to your binder.`);
      setIdentifyQuery('');
      setIdentifyResults([]);
      setPreviewUrl('');
      setSelectedFile(null);
      setActiveTab('portfolio');
    } catch (error) {
      setScanError(error.message || 'Could not add card.');
    }
  };

  const handleScan = async () => {
    if (!selectedFile) {
      setScanError('Choose a card photo first.');
      return;
    }

    setIsScanning(true);
    setScanError('');
    setScanMessage('Analyzing your card image...');

    try {
      const optimized = await optimizeImageForScan(selectedFile);
      let scanData = {};
      try {
        const scanResponse = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: optimized.base64,
            mimeType: optimized.mimeType,
          }),
        });
        scanData = await scanResponse.json();
        if (!scanResponse.ok) {
          throw new Error(scanData?.error || 'Card scan failed.');
        }
      } catch {
        scanData = {};
      }

      const typedName = manualName.trim() || identifyQuery.trim();
      const resolvedName = typedName || String(scanData.cardName || '').trim();
      const resolvedNumber = manualNumber.trim() || String(scanData.cardNumber || '').trim();

      if (!typedName && scanData?.message) {
        setScanMessage(scanData.message);
      }

      if (!resolvedName) {
        const aiHint = String(scanData.pokemonName || '').trim();
        if (aiHint) {
          setIdentifyQuery(aiHint);
          setScanError('AI found partial details. Pick the correct card from the list below to finish adding.');
          setScanMessage('Almost there. Confirm the card name from suggestions and scan again.');
        } else {
          setScanError('Could not identify this card automatically. Use the Name this card field, then scan again.');
        }
        return;
      }

      if (!scanData.cardName && typedName) {
        setScanMessage('AI scan was unavailable, but your manual card name was used successfully.');
      }

      const fallbackCard = buildFallbackCard(selectedFile.name, {
        name: resolvedName,
        set: manualSet || scanData.setName,
        number: resolvedNumber,
        price: manualPrice || scanData.estimatedValue,
      });

      const marketResponse = await fetch('/api/pokewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${fallbackCard.cardName} ${fallbackCard.cardNumber}`.trim() }),
      });
      const marketData = await marketResponse.json();
      const tcgCard = pickBestCardMatch(marketData.results, fallbackCard.cardNumber);

      const payload = {
        ...buildFallbackCard(selectedFile.name, {
          name: tcgCard?.name || fallbackCard.cardName,
          set: tcgCard?.set || fallbackCard.setName,
          number: tcgCard?.number || fallbackCard.cardNumber,
          price: manualPrice || tcgCard?.priceValue || marketData.marketEstimate || fallbackCard.estimatedValue,
        }),
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
      setIdentifyQuery('');
      setIdentifyResults([]);
      setPreviewUrl('');
      setSelectedFile(null);
      setActiveTab('portfolio');
    } catch (error) {
      setScanError(error.message || 'Scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveCard = async (cardId) => {
    if (!cardId) return;

    const previous = cards;
    setCards((current) => current.filter((card) => card.id !== cardId));

    try {
      if (user && !String(cardId).startsWith('local-')) {
        await deleteDoc(doc(db, 'users', user.uid, 'binder', cardId));
      }
    } catch {
      setCards(previous);
      setScanError('Could not remove card. Please try again.');
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
    setSearchMessage('Checking live market listings...');

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

      if (mapped.length) {
        setSearchResults(mapped);
        setSearchMessage(`Found ${mapped.length} matching cards from live Pokemon TCG data.`);
      } else {
        setSearchResults([]);
        setSearchMessage('No matching cards found for that search. Try a broader name.');
      }
    } catch {
      setSearchResults(buildSearchResults(query));
      setSearchMessage('Live pricing is temporarily unavailable. Showing starter examples instead.');
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
      imageUrl: result.imageUrl,
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
      <header className="top-nav-shell">
        <div className="top-nav-brand">
          <BrandLogo />
        </div>
        <div className="tab-row" role="tablist" aria-label="Main sections">
          <button type="button" className={`tab-btn ${activeTab === 'discover' ? 'active' : ''}`} onClick={() => setActiveTab('discover')}>Discover</button>
          <button type="button" className={`tab-btn ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>Scan</button>
          <button type="button" className={`tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>Portfolio</button>
        </div>
        <div className="top-nav-kpi">Tracked cards: <strong>{cards.length}</strong></div>
      </header>

      <section className="hero-card">
        <div>
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
            <button type="submit" disabled={searchLoading}>{searchLoading ? 'Searching...' : 'Search'}</button>
          </form>
          {searchMessage ? <p className="muted-text">{searchMessage}</p> : null}
          <div className="result-grid">
            {searchResults.map((item) => {
              const dealUrl = buildEbaySearchUrl(item.name, item.number);
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
          <p className="panel-copy">Take a photo or upload one, then type the card name to instantly find it with a live price.</p>
          <div className="scan-tips">
            <strong>Scan tips for better reads</strong>
            <p>Keep the card fully inside frame, align edges straight, and avoid sleeve glare. Use good light and fill at least 70% of the frame.</p>
          </div>

          <div className="scan-photo-row">
            <div className="scan-preview-box">
              {previewUrl
                ? (
                  <>
                    <img src={previewUrl} alt="Card preview" className="scan-preview-img" />
                    <div className="scan-preview-guide" aria-hidden="true">
                      <span>Center card in frame</span>
                    </div>
                  </>
                )
                : <div className="scan-preview-empty"><span style={{ fontSize: '2rem' }}>📷</span><span>Photo preview</span></div>
              }
            </div>
            <div className="scan-upload-col">
              <label className="upload-button">
                <span>Choose photo</span>
                <input type="file" accept="image/*" onChange={handleFileChange} />
              </label>
              <button type="button" className="upload-button camera-btn" onClick={() => setShowCamera(true)}>
                Use camera
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
                placeholder="e.g. Charizard ex, Pikachu V, Umbreon VMAX..."
                autoComplete="off"
              />
              {identifyLoading ? <span className="identify-spinner">Searching...</span> : null}
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

          <div className="scan-actions">
            <button className="primary-btn" onClick={handleScan} disabled={isScanning || !selectedFile}>
              {isScanning ? 'Scanning...' : 'Scan image & add card'}
            </button>
            {!selectedFile ? <p className="muted-text">Add a photo first, then scan.</p> : null}
          </div>

          <details className="advanced-scan">
            <summary>Advanced: manual values</summary>
            <div className="manual-grid" style={{ marginTop: 12 }}>
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Card name override" />
              <input value={manualSet} onChange={(e) => setManualSet(e.target.value)} placeholder="Set override" />
              <input value={manualNumber} onChange={(e) => setManualNumber(e.target.value)} placeholder="Number override" />
              <input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Price override" />
              <input value={manualQuantity} onChange={(e) => setManualQuantity(e.target.value)} placeholder="Quantity" />
              <input value={manualCost} onChange={(e) => setManualCost(e.target.value)} placeholder="Your cost" />
            </div>
          </details>

          {scanInsight?.imageUrl ? <img src={scanInsight.imageUrl} alt={scanInsight.cardName || 'Card'} className="insight-card-img" /> : null}
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
            getDealUrl={buildEbaySearchUrl}
          />
        </section>
      ) : null}
    </main>
  );
}
