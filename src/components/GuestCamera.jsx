import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

export function GuestCamera() {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setStream(mediaStream);
      } catch (err) {
        setErrorMsg('Camera access denied or unfortuntely not supported on this device.');
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const takeSnapshotAndUpload = async () => {
    setErrorMsg('');
    setLoading(true);
    const video = videoRef.current;

    if (!video) return;

    // Build Polaroid composite via HTML5 Canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const size = 1080;
    const borderTop = 60;
    const borderSide = 60;
    const borderBottom = 220;

    canvas.width = size + borderSide * 2;
    canvas.height = size + borderTop + borderBottom;

    // 1. Polaroid White Frame
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Center crop from stream
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - minDim) / 2;
    const sy = (video.videoHeight - minDim) / 2;

    ctx.drawImage(video, sx, sy, minDim, minDim, borderSide, borderTop, size, size);

    // 3. Frame Caption
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LIVE EVENT 2026', canvas.width / 2, canvas.height - 80);

    // 4. Export & Upload
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setErrorMsg('Failed to process canvas image.');
        setLoading(false);
        return;
      }

      // Security check file constraints
      if (!ALLOWED_TYPES.includes(blob.type) || blob.size > MAX_SIZE_BYTES) {
        setErrorMsg('Invalid file format or file size exceeded (5MB max).');
        setLoading(false);
        return;
      }

      const fileName = `photo_${Date.now()}.jpg`;

      const { error: storageError } = await supabase.storage
        .from('event-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (storageError) {
        setErrorMsg(`Storage Error: ${storageError.message}`);
        setLoading(false);
        return;
      }

      const imageUrl = supabase.storage.from('event-photos').getPublicUrl(fileName).data.publicUrl;

      const { error: dbError } = await supabase
        .from('photos')
        .insert([{ image_url: imageUrl, status: 'pending' }]);

      if (dbError) {
        setErrorMsg(`DB Error: ${dbError.message}`);
        setLoading(false);
        return;
      }

      setLoading(false);
      setSubmitted(true);
    }, 'image/jpeg', 0.85);
  };

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <h2>Photo Sent! 📸</h2>
        <p style={{ marginTop: '12px', color: '#aaa' }}>
          Your picture is in the moderation queue and will pop up on screen once approved.
        </p>
        <button 
          onClick={() => setSubmitted(false)} 
          style={{ marginTop: '20px', padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px' }}
        >
          Take Another Photo
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <h2>Snap a Polaroid</h2>
      {errorMsg && <p style={{ color: '#ef4444' }}>{errorMsg}</p>}
      
      <div style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', display: 'block' }} />
      </div>

      <button
        onClick={takeSnapshotAndUpload}
        disabled={loading}
        style={{
          padding: '14px 28px',
          fontSize: '18px',
          fontWeight: 'bold',
          borderRadius: '30px',
          background: loading ? '#555' : '#e11d48',
          color: '#fff',
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Processing & Sending...' : 'Snap & Post 📸'}
      </button>
    </div>
  );
}