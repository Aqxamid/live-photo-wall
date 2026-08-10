import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

export function LiveWall() {
  const [photos, setPhotos] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [toast, setToast] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wallRef = useRef(null);
  const autoPopupTimer = useRef(null);
  const autoPopupCloseTimer = useRef(null);

  const submitUrl = typeof window !== 'undefined' ? window.location.origin + '/' : '/';

  const hashString = (value) => String(value)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const getBubbleMetadata = (photo, index) => {
    const hash = hashString(photo.id || photo.image_url || index);
    const ageFactor = 1 - Math.min(index / Math.max(photos.length - 1, 1), 1);
    const size = 110 + Math.round(ageFactor * 38) + (hash % 18);
    const left = 2 + (hash % 88);
    const top = 2 + ((hash >> 2) % 88);
    const duration = 9 + (hash % 6);
    const delay = -(hash % 5);
    const opacity = 0.72 + ((hash % 18) / 100);
    const rotation = (hash % 14) - 7;
    const zIndex = Math.round(100 + (ageFactor * 100));

    return { size, left, top, duration, delay, opacity, rotation, zIndex };
  };

  const getBubbleStyle = (photo, index) => {
    const meta = getBubbleMetadata(photo, index);
    const isActive = selectedPhoto?.id === photo.id;
    return {
      position: 'absolute',
      left: `${meta.left}%`,
      top: `${meta.top}%`,
      width: `${isActive ? meta.size * 2 : meta.size * 1.9}px`,
      height: `${isActive ? meta.size * 2.6 : meta.size * 2.25}px`,
      opacity: isActive ? 1 : meta.opacity,
      zIndex: isActive ? 2000 : meta.zIndex,
      animationName: 'float-around',
      animationDuration: `${meta.duration}s`,
      animationDelay: `${meta.delay}s`,
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDirection: 'alternate',
      animationPlayState: isActive ? 'paused' : 'running',
      transform: `translate3d(0,0,0) rotate(${meta.rotation}deg) scale(${isActive ? 1.06 : 1})`,
      willChange: 'transform, opacity',
      cursor: 'pointer',
      boxShadow: isActive ? '0 22px 40px rgba(0,0,0,0.3)' : '0 16px 26px rgba(0,0,0,0.12)',
      border: isActive ? '2px solid rgba(138,154,91,0.35)' : '1px solid transparent',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
      filter: isActive ? 'brightness(1.03)' : 'none',
    };
  };

  useEffect(() => {
    // 1. Initial Load of approved photos
    supabase
      .from('photos')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setPhotos(data);
      });

    // 2. Real-time Subscription for approved photos (add DELETE handler)
    const channel = supabase
      .channel('live-wall-stream')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'photos',
          filter: 'status=eq.approved',
        },
        (payload) => {
          // Mark incoming photo as new so it can flash then clear flag
          const incoming = { ...payload.new, _isNew: true };
          setPhotos((prev) => [incoming, ...prev]);
          // Clear the _isNew flag after animation so it doesn't persist
          setTimeout(() => {
            setPhotos((prev) => prev.map((p) => (p.id === incoming.id ? { ...p, _isNew: false } : p)));
          }, 1400);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'photos',
        },
        (payload) => {
          // Remove deleted photo from the wall and show a small toast
          const removedId = payload.old?.id;
          if (removedId) {
            setPhotos((prev) => prev.filter((p) => p.id !== removedId));
            setToast('A photo was removed');
            setTimeout(() => setToast(null), 3000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wallRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (viewMode !== 'bubbles') return;

    const schedulePopup = () => {
      if (!photos.length) return;
      window.clearTimeout(autoPopupTimer.current);
      window.clearTimeout(autoPopupCloseTimer.current);
      autoPopupTimer.current = window.setTimeout(() => {
        const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
        setSelectedPhoto(randomPhoto);
        autoPopupCloseTimer.current = window.setTimeout(() => {
          setSelectedPhoto(null);
          schedulePopup();
        }, 3000);
      }, 30000);
    };

    schedulePopup();

    return () => {
      window.clearTimeout(autoPopupTimer.current);
      window.clearTimeout(autoPopupCloseTimer.current);
    };
  }, [viewMode, photos]);

  const toggleFullscreen = () => {
    if (!wallRef.current) return;
    if (document.fullscreenElement === wallRef.current) {
      document.exitFullscreen?.();
    } else {
      wallRef.current.requestFullscreen?.().catch(() => {
        setToast('Fullscreen mode is not available in this browser.');
      });
    }
  };

  return (
    <div ref={wallRef} className={`livewall-shell${isFullscreen ? ' fullscreen-active' : ''}`} style={{ background: 'var(--main-bg)', padding: '16px 12px', borderRadius: '0', position: 'relative', minHeight: '100vh' }}>
      {toast && (
        <div style={{ position: 'fixed', right: 16, bottom: 100, zIndex: 10000, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 14 }}>
          {toast}
        </div>
      )}
      <div className="livewall-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', transition: 'opacity 0.2s ease', zIndex: 10005 }}>
        <h2 style={{ textAlign: 'center', margin: 0 }}>Live Wall</h2>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 10001, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className={`bubble-mode-button ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            Polaroid Grid
          </button>
          <button
            className={`bubble-mode-button ${viewMode === 'bubbles' ? 'active' : ''}`}
            onClick={() => setViewMode('bubbles')}
          >
            Floating Bubbles
          </button>
          <button className="bubble-mode-button" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
      {/* QR quick-scan for guests to open the submission page on their phone */}
      <div className="qr-overlay" style={{ position: 'fixed', left: 12, bottom: 12, width: 96, zIndex: 9999, textAlign: 'center', background: 'transparent' }}>
        <a href={submitUrl} target="_blank" rel="noreferrer noopener">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(submitUrl)}`}
            alt="Scan to take a photo and submit to the live wall"
            style={{ width: '100%', height: 'auto', borderRadius: 8, padding: 4, background: 'transparent', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
          />
        </a>
      </div>
      {viewMode === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 38vw), 1fr))',
            gap: '22px',
            minHeight: 'calc(100vh - 180px)',
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={photo._isNew ? 'photo-card flash' : 'photo-card'}
              style={{ transform: 'none', transition: 'transform 0.3s ease' }}
            >
              <img
                src={photo.image_url}
                alt="Approved event snapshot"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="bubble-wall" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 80px)', minHeight: 'calc(100vh - 80px)', maxWidth: '100%', margin: '0', padding: '28px 18px' }}>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              role="button"
              tabIndex={0}
              className={`bubble-card ${photo._isNew ? 'pop-in' : ''}`}
              style={getBubbleStyle(photo, index)}
              onClick={() => setSelectedPhoto(photo)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  setSelectedPhoto(photo);
                }
              }}
            >
              <img src={photo.image_url} alt="Approved event snapshot" />
            </div>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div className="bubble-modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="bubble-modal" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto.image_url} alt="Selected live wall photo" />
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Polaroid View</h3>
                <p style={{ margin: '8px 0 0', color: 'rgba(0,0,0,0.7)' }}>{selectedPhoto.caption || 'No caption provided'}</p>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--sage)', color: 'var(--polaroid)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}