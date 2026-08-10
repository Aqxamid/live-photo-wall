import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function AdminConsole() {
  const [session, setSession] = useState(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    // Load initial queue
    supabase
      .from('photos')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => setPendingPhotos(data || []));

    // Listen for new inserts
    const channel = supabase
      .channel('admin-queue')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (payload) => {
        setPendingPhotos((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const updatePhotoStatus = async (id, status) => {
    // Optimistic removal
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));

    const { error } = await supabase
      .from('photos')
      .update({ status })
      .eq('id', id);

    if (error) {
      alert(`Error updating photo status: ${error.message}`);
    }
  };

  if (!session) {
    return (
      <form
        onSubmit={handleLogin}
        style={{
          maxWidth: '320px',
          margin: '40px auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: '#1e1e1e',
          padding: '24px',
          borderRadius: '8px',
        }}
      >
        <h3>Moderator Login</h3>
        <input
          type="email"
          placeholder="Admin Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px' }}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Pending Moderation Queue ({pendingPhotos.length})</h2>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px' }}
        >
          Sign Out
        </button>
      </div>

      {pendingPhotos.length === 0 ? (
        <p style={{ color: '#888' }}>Queue clear. Waiting for guests to upload photos...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {pendingPhotos.map((photo) => (
            <div key={photo.id} style={{ background: '#1e1e1e', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
              <img
                src={photo.image_url}
                alt="Pending approval"
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => updatePhotoStatus(photo.id, 'approved')}
                  style={{ flex: 1, padding: '8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => updatePhotoStatus(photo.id, 'rejected')}
                  style={{ flex: 1, padding: '8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}