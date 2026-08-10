import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function AdminConsole() {
  const [session, setSession] = useState(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [approvedPhotos, setApprovedPhotos] = useState([]);
  const [autoApprove, setAutoApprove] = useState(() => {
    try { return localStorage.getItem('pcs_autoApprove') === '1'; } catch (e) { return false; }
  });
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

    // Load initial pending photos
    supabase
      .from('photos')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => setPendingPhotos(data || []));

    // Load approved photos for admin to manage/delete
    supabase
      .from('photos')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data }) => setApprovedPhotos(data || []));

    // Real-time listener for incoming uploads and deletions
    const channel = supabase.channel('admin-queue')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, async (payload) => {
        // If auto-approve is enabled, approve immediately on insert
        if (payload.new.status === 'pending' && autoApprove) {
          // optimistically do not add to pending queue
          const { error } = await supabase.from('photos').update({ status: 'approved' }).eq('id', payload.new.id);
          if (error) {
            // fallback: add to queue so admin can act
            setPendingPhotos((prev) => [...prev, payload.new]);
          }
        } else {
          if (payload.new.status === 'pending') setPendingPhotos((prev) => [...prev, payload.new]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'photos', filter: 'status=eq.approved' }, (payload) => {
        // Prepend newly approved to approvedPhotos for management
        setApprovedPhotos((prev) => [payload.new, ...prev]);
        // Also remove from pending queue if present
        setPendingPhotos((prev) => prev.filter((p) => p.id !== payload.new.id));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos' }, (payload) => {
        // When a photo row is deleted, remove it from both approved and pending lists
        const removedId = payload.old?.id;
        if (removedId) {
          setPendingPhotos((prev) => prev.filter((p) => p.id !== removedId));
          setApprovedPhotos((prev) => prev.filter((p) => p.id !== removedId));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, autoApprove]);

  const approveAll = async () => {
    if (!pendingPhotos.length) return;
    const ids = pendingPhotos.map((p) => p.id);
    const { error } = await supabase.from('photos').update({ status: 'approved' }).in('id', ids);
    if (error) return alert(`Failed to approve all: ${error.message}`);
    // Move all locally to approvedPhotos (refetch for correctness)
    const { data } = await supabase.from('photos').select('*').eq('status', 'approved').order('created_at', { ascending: false });
    setApprovedPhotos(data || []);
    setPendingPhotos([]);
  };

  const deletePhoto = async (photo) => {
    if (!confirm('Delete this photo and remove from storage?')) return;
    try {
      // derive storage path from public url
      const url = photo.image_url || '';
      const last = url.split('/').pop() || '';
      const path = last.split('?')[0];

      if (path) {
        const { error: storageError } = await supabase.storage.from('event-photos').remove([path]);
        if (storageError) console.warn('Storage remove error:', storageError.message);
      }

      const { error } = await supabase.from('photos').delete().eq('id', photo.id);
      if (error) return alert(`Failed to delete DB record: ${error.message}`);

      // update UI
      setPendingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setApprovedPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (e) {
      alert('Error deleting photo');
    }
  };

  useEffect(() => {
    try { localStorage.setItem('pcs_autoApprove', autoApprove ? '1' : '0'); } catch (e) {}
  }, [autoApprove]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const updatePhotoStatus = async (id, status) => {
    // Optimistic UI update (remove from admin queue immediately)
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
          maxWidth: '360px',
          margin: '40px auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: 'var(--main-bg)',
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
          style={{ padding: '10px', background: 'var(--sage)', color: 'var(--polaroid)', border: 'none', borderRadius: '6px' }}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Queue</span>
            <span style={{ background: 'var(--sage)', color: 'var(--polaroid)', padding: '6px 10px', borderRadius: 20, fontWeight: 700 }}>{pendingPhotos.length}</span>
          </h2>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '8px', fontSize: '14px', color: 'rgba(0,0,0,0.7)' }}>
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            <span style={{ color: 'var(--text)' }}>Auto-approve</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={approveAll}
            style={{ padding: '6px 12px', background: 'var(--sage)', color: 'var(--polaroid)', border: 'none', borderRadius: '4px' }}
          >
            Approve All
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ padding: '6px 12px', background: 'var(--status-rejected-text)', color: 'var(--polaroid)', border: 'none', borderRadius: '4px' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {pendingPhotos.length === 0 ? (
        <p style={{ color: 'rgba(0,0,0,0.6)' }}>Queue clear. Waiting for guests to upload photos...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {pendingPhotos.map((photo) => (
            <div key={photo.id} style={{ background: 'var(--polaroid)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)' }}>
              <img
                src={photo.image_url}
                alt="Pending approval"
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ padding: '6px 8px', borderRadius: '6px', background: photo.status === 'pending' ? 'var(--status-pending-bg)' : photo.status === 'approved' ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)', color: photo.status === 'pending' ? 'var(--status-pending-text)' : photo.status === 'approved' ? 'var(--status-approved-text)' : 'var(--status-rejected-text)', fontWeight:700 }}>
                    {photo.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => updatePhotoStatus(photo.id, 'approved')}
                    style={{ flex: 1, padding: '8px', background: 'var(--sage)', color: 'var(--polaroid)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updatePhotoStatus(photo.id, 'rejected')}
                    style={{ flex: 1, padding: '8px', background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => deletePhoto(photo)}
                    style={{ flex: 0.6, padding: '8px', background: '#fff', color: 'var(--status-rejected-text)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid rgba(0,0,0,0.06)' }} />

      <h3>Approved Photos</h3>
      {approvedPhotos.length === 0 ? (
        <p style={{ color: 'rgba(0,0,0,0.6)' }}>No approved photos yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {approvedPhotos.map((photo) => (
            <div key={photo.id} style={{ background: 'var(--polaroid)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)' }}>
              <img src={photo.image_url} alt="Approved" style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '4px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{photo.caption || ''}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => deletePhoto(photo)} style={{ padding: '8px', background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}