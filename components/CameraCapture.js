'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState('environment');

  const startCamera = useCallback(async (mode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setReady(false);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : `Camera error: ${err.message}`,
      );
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode, startCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        onCapture(file, url);
        onClose();
      },
      'image/jpeg',
      0.88,
    );
  };

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true" aria-label="Camera capture">
      <div className="camera-modal">
        <div className="camera-topbar">
          <span className="eyebrow">Camera</span>
          <button type="button" className="camera-close" onClick={onClose} aria-label="Close camera">✕</button>
        </div>

        {error ? (
          <p className="error-text" style={{ padding: '20px', textAlign: 'center' }}>{error}</p>
        ) : (
          <div className="camera-stage">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
            <div className="scan-guide-frame" aria-hidden="true">
              <span className="scan-guide-label">Align card inside frame</span>
            </div>
            <p className="scan-guide-help">Keep the card flat, fill most of the frame, and avoid glare.</p>
          </div>
        )}

        <div className="camera-controls">
          <button
            type="button"
            className="secondary-cta"
            onClick={() => setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'))}
          >
            Flip camera
          </button>
          <button
            type="button"
            className="primary-btn camera-capture-btn"
            onClick={capture}
            disabled={!ready || Boolean(error)}
          >
            {ready ? 'Capture' : 'Starting...'}
          </button>
          <button type="button" className="secondary-cta" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
