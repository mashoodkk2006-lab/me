import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Keyboard, RefreshCw, AlertCircle } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    setCameraError('');
    setIsScanning(true);

    try {
      const elementId = 'aurora-qr-reader';
      // Wait for DOM element
      await new Promise(r => setTimeout(r, 100));

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode(elementId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: 'environment' }, // Back camera preferred on phones
        config,
        (decodedText) => {
          // Success callback
          stopScanner();
          onScanSuccess(decodedText);
        },
        (errorMsg) => {
          // Ignore scanning frame misses
        }
      );
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError('Camera access unavailable or permission denied. You can manually enter the Team ID below.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        // ignore cleanup error
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    stopScanner();
    onScanSuccess(manualCode.trim());
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} color="#ff1e42" />
            <span style={{ fontWeight: 800, letterSpacing: '1px', fontSize: '0.95rem' }}>
              TEAM QR SCANNER
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Camera Scanner Viewport */}
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div
            id="aurora-qr-reader"
            style={{
              width: '100%',
              minHeight: '260px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: '#07080a',
              border: '1px solid var(--border-subtle)',
              position: 'relative'
            }}
          />

          {cameraError && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textAlign: 'left'
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Entry Fallback */}
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}
            >
              <Keyboard size={14} />
              <span>OR ENTER TEAM ID MANUALLY</span>
            </div>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. AURORA001 or Token"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                style={{ flex: 1, textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 20px' }}>
                VERIFY
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
            POINT AT TEAM QR BADGE
          </span>
          <button
            onClick={startScanner}
            className="btn btn-secondary"
            style={{ padding: '4px 10px', minHeight: '30px', fontSize: '0.75rem' }}
          >
            <RefreshCw size={12} /> RESTART CAMERA
          </button>
        </div>
      </div>
    </div>
  );
}
