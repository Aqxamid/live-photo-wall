import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
const DEFAULT_JPEG_QUALITY = 0.8; // recommended balance of quality vs size


export function GuestCamera() {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        // Prefer exact facing mode where supported. Provide constraints for mobile front/back.
        const constraints = {
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1080 } },
          audio: false,
        };

        // Stop existing stream first (if attached to the video element)
        if (videoRef.current && videoRef.current.srcObject) {
          const prev = videoRef.current.srcObject;
          try { prev.getTracks().forEach((t) => t.stop()); } catch (e) {}
          videoRef.current.srcObject = null;
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      } catch (err) {
        setErrorMsg('Camera access denied or unfortunately not supported on this device.');
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

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

    // 1. Polaroid White Frame (use pure white matting)
    ctx.fillStyle = '#FFFFFF';
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

    // 4. Export & Upload with iterative compression/resizing to respect MAX_SIZE_BYTES
    async function compressAndGetBlob(canvasEl, mime = 'image/jpeg') {
      // Try descending quality, then downscale if necessary
      let quality = DEFAULT_JPEG_QUALITY;
      const minQuality = 0.55;
      const qualityStep = 0.05;
      let currentCanvas = canvasEl;

      while (true) {
        const blob = await new Promise((res) => currentCanvas.toBlob(res, mime, quality));
        if (!blob) return null;
        if (blob.size <= MAX_SIZE_BYTES || quality <= minQuality) {
          return blob;
        }
        // reduce quality and try again
        quality = Math.max(minQuality, quality - qualityStep);
        if (quality <= minQuality) {
          // if still too big, downscale the canvas by 90% and retry from default quality
          const scaled = document.createElement('canvas');
          scaled.width = Math.round(currentCanvas.width * 0.9);
          scaled.height = Math.round(currentCanvas.height * 0.9);
          const sctx = scaled.getContext('2d');
          sctx.drawImage(currentCanvas, 0, 0, scaled.width, scaled.height);
          currentCanvas = scaled;
          quality = DEFAULT_JPEG_QUALITY;
        }
      }
    }

    const blob = await compressAndGetBlob(canvas, 'image/jpeg');
    (async () => {
      if (!blob) {
        setErrorMsg('Failed to process canvas image.');
        setLoading(false);
        return;
      }
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
    })();
  };

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7h3l2-3h6l2 3h3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Photo Sent!
        </h2>
        <p style={{ marginTop: '12px', color: 'var(--muted)' }}>
          Your picture is in the moderation queue and will pop up on screen once approved.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
          <button
            onClick={() => setSubmitted(false)}
            style={{ padding: '10px 20px', background: 'var(--sage)', color: 'var(--polaroid)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Take Another Photo
          </button>
          <button
            onClick={() => {
              window.history.pushState({}, '', '/wall');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            style={{ padding: '10px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '6px', cursor: 'pointer' }}
          >
            View Live Wall
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: 'transparent' }}>
      <h2>Snap a Polaroid</h2>
      {errorMsg && <p style={{ color: 'var(--status-rejected-text)' }}>{errorMsg}</p>}
      
      <div style={{ width: '100%', maxWidth: '420px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.6)', padding: '6px' }}>
        <div style={{ background: 'var(--polaroid)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
          <video ref={videoRef} autoPlay playsInline style={{ width: '100%', display: 'block' }} />

          {/* top-right camera flip control */}
          <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
              style={{ padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.36)', color: 'var(--polaroid)', border: 'none', cursor: 'pointer' }}
              aria-label="Flip camera"
            >
              {facingMode === 'environment' ? 'Back' : 'Front'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom control bar: Snap button centered */}
      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
        <button
          onClick={takeSnapshotAndUpload}
          disabled={loading}
          style={{
            padding: '14px 28px',
            fontSize: '18px',
            fontWeight: '700',
            borderRadius: '30px',
            background: loading ? 'rgba(0,0,0,0.08)' : 'var(--sage)',
            color: 'var(--polaroid)',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {loading ? 'Processing & Sending...' : 'Snap & Post'}
        </button>
      </div>
    </div>
  );
}