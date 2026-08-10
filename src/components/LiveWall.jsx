import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function LiveWall() {
  const [photos, setPhotos] = useState([]);

  const submitUrl = typeof window !== 'undefined' ? window.location.origin + '/' : '/';

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

    // 2. Real-time Subscription for approved photos
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div style={{ background: 'var(--wall-bg)', padding: '20px', borderRadius: '10px', position: 'relative' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>Live Wall</h2>
      {/* QR quick-scan for guests to open the submission page on their phone */}
      <div style={{ position: 'fixed', left: 12, bottom: 12, width: 96, zIndex: 9999, textAlign: 'center' }}>
        <a href={submitUrl} target="_blank" rel="noreferrer noopener">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(submitUrl)}`}
            alt="Scan to take a photo and submit to the live wall"
            style={{ width: '100%', height: 'auto', borderRadius: 8, padding: 6, background: 'var(--polaroid)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}
          />
        </a>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--polaroid)' }}>Scan to take a photo!</div>
      </div>
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
              style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block', borderRadius: '2px' }}
            />
            <div style={{ marginTop: '8px', textAlign: 'center' }} className="polaroid-caption">{photo.caption || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}