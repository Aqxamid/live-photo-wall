import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function LiveWall() {
  const [photos, setPhotos] = useState([]);

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
          // Prepend the newly approved photo to state
          setPhotos((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>Live Wall</h2>
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
            style={{
              background: 'var(--surface)',
              padding: '10px 10px 24px 10px',
              borderRadius: '4px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
              transform: 'rotate(-1deg)',
              transition: 'transform 0.3s ease',
            }}
          >
            <img
              src={photo.image_url}
              alt="Approved event snapshot"
              style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}