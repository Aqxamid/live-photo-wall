import React, { useState, useEffect } from 'react';
import { GuestCamera } from './components/GuestCamera';
import { LiveWall } from './components/LiveWall';
import { AdminConsole } from './components/AdminConsole';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  return (
    <div>
      <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        {route === '/' && <GuestCamera />}
        {route === '/wall' && <LiveWall />}
        {route === '/admin' && <AdminConsole />}
      </main>
    </div>
  );
}