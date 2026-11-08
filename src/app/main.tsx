import { ImmersiveShell } from '../ui/ImmersiveShell';
import { TouchControls } from '../ui/TouchControls';
import React, { useState, useCallback, useEffect, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Scene } from '../render/Scene';
import { Interface } from '../ui/Interface';
import { installKeyboard } from '../input/keyboard';
import './style.css';
import './premium.css';
import { PhysicsDebugToggle } from '../ui/PhysicsDebug';
import { audioManager } from '../audio/AudioManager';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="error">
        <h1>Let’s get back on track.</h1>
        <p>
          APEX could not initialize graphics or physics. Use a WebGL2 browser with hardware
          acceleration enabled.
        </p>
        <pre>{this.state.error}</pre>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [ready, setReady] = useState(false),
    [slow, setSlow] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(installKeyboard, []);
  useEffect(() => audioManager.install(), []);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <ErrorBoundary>
      <Scene onReady={onReady} />
      {ready ? (
        <>
          <ImmersiveShell>
            <Interface />
            <TouchControls />
          </ImmersiveShell>
          {import.meta.env.DEV && <PhysicsDebugToggle />}
        </>
      ) : (
        <div className="loading">
          <span className="wordmark">APEX /</span>
          <h2>Preparing the circuit</h2>
          <div className="load-track">
            <i />
          </div>
          <p>
            {slow
              ? 'Still loading. If this persists, check WebGL2 support and reload.'
              : 'Building the circuit · initializing physics'}
          </p>
          {slow && <button onClick={() => location.reload()}>Retry</button>}
        </div>
      )}
    </ErrorBoundary>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
