import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function LiveWall() {
  const [photos, setPhotos] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [toast, setToast] = useState(null);

  const submitUrl = typeof window !== 'undefined' ? window.location.origin + '/' : '/';

  const hashString = (value) => String(value)
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const getBubbleMetadata = (photo, index) => {
    const hash = hashString(photo.id || photo.image_url || index);
    const ageFactor = 1 - Math.min(index / Math.max(photos.length - 1, 1), 1);
    const size = 110 + Math.round(ageFactor * 70) + (hash % 20);
    const left = 10 + (hash % 70);
    const top = 8 + ((hash >> 2) % 70);
    const duration = 11 + (hash % 8);
    const delay = -(hash % 6);
    const opacity = 0.75 + ((hash % 20) / 100);
    const zIndex = Math.round(1000 - index * 2);

    return { size, left, top, duration, delay, opacity, zIndex };
  };

  const getBubbleStyle = (photo, index) => {
    const meta = getBubbleMetadata(photo, index);
    return {
      position: 'absolute',
      left: `${meta.left}%`,
      top: `${meta.top}%`,
      width: `${meta.size}px`,
      height: `${meta.size}px`,
      opacity: meta.opacity,
      zIndex: selectedPhoto?.id === photo.id ? 2000 : meta.zIndex,
      animationName: 'float-around',
      animationDuration: `${meta.duration}s`,
      animationDelay: `${meta.delay}s`,
      animationTimingFunction: 'ease-in-out',
      animationIterationCount: 'infinite',
      animationDirection: 'alternate',
      animationPlayState: selectedPhoto?.id === photo.id ? 'paused' : 'running',
      transform: 'translate3d(0,0,0)',
      willChange: 'transform, opacity',
      cursor: 'pointer',
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

  return (
    <div style={{ background: 'var(--wall-bg)', padding: '20px', borderRadius: '10px', position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', right: 16, bottom: 100, zIndex: 10000, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 14 }}>
          {toast}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ textAlign: 'center', margin: 0 }}>Live Wall</h2>
        <div style={{ display: 'flex', gap: '8px', position: 'relative', zIndex: 10001 }}>
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
        </div>
      </div>
      {/* QR quick-scan for guests to open the submission page on their phone */}
      <div style={{ position: 'fixed', left: 12, bottom: 12, width: 96, zIndex: 9999, textAlign: 'center' }}>
        <a href={submitUrl} target="_blank" rel="noreferrer noopener">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(submitUrl)}`}
            alt="Scan to take a photo and submit to the live wall"
            style={{ width: '100%', height: 'auto', borderRadius: 8, padding: 6, background: 'var(--polaroid)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}
          />
        </a>
        <div style={{ marginTop: 6, fontSize: 13, color: '#000' }}>Scan to take a photo!</div>
      </div>
      {viewMode === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '24px',
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={photo._isNew ? 'photo-card flash' : 'photo-card'}
              style={{
                background: 'var(--polaroid)',
                padding: '10px 10px 24px 10px',
                borderRadius: '4px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
                transform: 'rotate(-1deg)',
                transition: 'transform 0.3s ease',
              }}
            >
              <img
                src={photo.image_url}
                alt="Approved event snapshot"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '2px' }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="bubble-wall">
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