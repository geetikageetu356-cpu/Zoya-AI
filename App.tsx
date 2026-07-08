import { useState, useEffect, useRef } from 'react';
import { ConnectionState, ThemeColor, ThemeConfig, ActionLog, PendingAction, NotificationItem } from './types';
import { AudioStreamer } from './audioStreamer';
import { GlowVisualizer } from './components/GlowVisualizer';
import { ZoyaControls } from './components/ZoyaControls';
import { Sparkles, Heart, HelpCircle, Info, ExternalLink, RefreshCw, Phone, MessageSquare, Settings, Camera, Smartphone, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const THEMES: Record<ThemeColor, ThemeConfig> = {
  purple: {
    name: 'Cosmic Purple',
    glowColor: 'rgba(168, 85, 247, 0.5)',
    bgGradient: 'from-slate-950 via-purple-950/20 to-slate-950',
    accentText: '#c084fc',
    accentBorder: '#a855f7',
    accentBg: '#6b21a8',
    accentGlow: 'rgba(168, 85, 247, 0.3)',
  },
  pink: {
    name: 'Hot Sassy Pink',
    glowColor: 'rgba(236, 72, 153, 0.5)',
    bgGradient: 'from-slate-950 via-pink-950/20 to-slate-950',
    accentText: '#f472b6',
    accentBorder: '#ec4899',
    accentBg: '#9d174d',
    accentGlow: 'rgba(236, 72, 153, 0.3)',
  },
  red: {
    name: 'Ruby Crimson',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    bgGradient: 'from-slate-950 via-red-950/20 to-slate-950',
    accentText: '#f87171',
    accentBorder: '#ef4444',
    accentBg: '#991b1b',
    accentGlow: 'rgba(239, 68, 68, 0.3)',
  },
  gold: {
    name: 'Amber Cyber Gold',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    bgGradient: 'from-slate-950 via-amber-950/20 to-slate-950',
    accentText: '#fbbf24',
    accentBorder: '#f59e0b',
    accentBg: '#78350f',
    accentGlow: 'rgba(245, 158, 11, 0.3)',
  },
  green: {
    name: 'Matrix Emerald',
    glowColor: 'rgba(16, 185, 129, 0.5)',
    bgGradient: 'from-slate-950 via-emerald-950/15 to-slate-950',
    accentText: '#34d399',
    accentBorder: '#10b981',
    accentBg: '#065f46',
    accentGlow: 'rgba(16, 185, 129, 0.3)',
  },
  blue: {
    name: 'Cyber Electric Blue',
    glowColor: 'rgba(6, 182, 212, 0.5)',
    bgGradient: 'from-slate-950 via-cyan-950/20 to-slate-950',
    accentText: '#22d3ee',
    accentBorder: '#06b6d4',
    accentBg: '#155e75',
    accentGlow: 'rgba(6, 182, 212, 0.3)',
  },
};

export default function App() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [themeColor, setThemeColor] = useState<ThemeColor>('purple');
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [streamer, setStreamer] = useState<AudioStreamer | null>(null);
  
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<ConnectionState>('disconnected');
  const streamerRef = useRef<AudioStreamer | null>(null);

  // Toast notification helper
  const addNotification = (message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 11);
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  // Hybrid Native Android Bridge helper
  const executeAndroidAction = (action: string, params?: any): boolean => {
    console.log(`[Zoya Native Bridge] Checking bridge for: ${action}`, params);
    
    // Check for standard injected window.Android object (Android WebView JavaScript Interface)
    if (typeof window !== 'undefined' && (window as any).Android) {
      const androidObj = (window as any).Android;
      try {
        if (typeof androidObj[action] === 'function') {
          androidObj[action](JSON.stringify(params || {}));
          console.log(`[Zoya Native Bridge] Successfully executed ${action} via window.Android`);
          return true;
        }
      } catch (e) {
        console.error(`[Zoya Native Bridge] Failed to execute ${action} on window.Android:`, e);
      }
    }

    // Check for Capacitor bridge fallback
    if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.ZoyaBridge) {
      try {
        const zoyaBridge = (window as any).Capacitor.Plugins.ZoyaBridge;
        if (typeof zoyaBridge[action] === 'function') {
          zoyaBridge[action](params || {});
          console.log(`[Zoya Native Bridge] Successfully executed ${action} via Capacitor plugin`);
          return true;
        }
      } catch (e) {
        console.error(`[Zoya Native Bridge] Failed to execute ${action} on Capacitor:`, e);
      }
    }

    console.warn(`[Zoya Native Bridge] No native bridge interface detected for action '${action}'. Browser fallback mode active.`);
    return false;
  };

  // Sync state refs to prevent closure binding stale values
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeTheme = THEMES[themeColor];

  // Helper to add activity log entries
  const addLog = (type: 'info' | 'tool' | 'error' | 'success', message: string, meta?: any) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const newLog: ActionLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      type,
      message,
      meta,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50)); // limit to last 50 logs
  };

  // Maps random colors from Gemini tool to our standard keys
  const mapColorToTheme = (colorStr: string): ThemeColor => {
    const norm = colorStr.toLowerCase();
    if (norm.includes('pink') || norm.includes('sassy') || norm.includes('rose') || norm.includes('magenta')) return 'pink';
    if (norm.includes('red') || norm.includes('crimson') || norm.includes('ruby') || norm.includes('orange') || norm.includes('fire')) return 'red';
    if (norm.includes('gold') || norm.includes('yellow') || norm.includes('amber') || norm.includes('bronze')) return 'gold';
    if (norm.includes('green') || norm.includes('emerald') || norm.includes('matrix') || norm.includes('mint')) return 'green';
    if (norm.includes('blue') || norm.includes('cyan') || norm.includes('sky') || norm.includes('aqua') || norm.includes('teal')) return 'blue';
    return 'purple';
  };

  // Handles disconnection and audio stream cleanups
  const disconnect = () => {
    setState('disconnected');
    
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {}
      socketRef.current = null;
    }

    if (streamerRef.current) {
      streamerRef.current.cleanup();
      streamerRef.current = null;
      setStreamer(null);
    }
    
    addLog('info', 'Disconnected from Zoya. Call ended.');
  };

  // Toggles the active call session
  const toggleConnection = async () => {
    if (stateRef.current !== 'disconnected' && stateRef.current !== 'error') {
      disconnect();
      return;
    }

    setState('connecting');
    addLog('info', "Dialing Zoya's real-time sassy brain cells...");

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//${window.location.host}/api/live`;
      const ws = new WebSocket(socketUrl);
      socketRef.current = ws;

      // Create new AudioStreamer instance
      const audioStream = new AudioStreamer(
        // Audio output Callback: Relays Int16 PCM to proxy websocket
        (base64Pcm) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'audio', audio: base64Pcm }));
          }
        },
        // Speech Activity Detection Callback: animates visual states
        (isSpeaking) => {
          setState((prev) => {
            // Only toggle states if we are idle or listening
            if (prev === 'idle' && isSpeaking) return 'listening';
            if (prev === 'listening' && !isSpeaking) return 'idle';
            return prev;
          });
        }
      );

      streamerRef.current = audioStream;
      setStreamer(audioStream);

      ws.onopen = () => {
        addLog('info', 'Secure WebSocket pipe established. Booting brain...');
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected') {
            setState('idle');
            addLog('success', "Zoya's brain is connected! Say hi to her.");
            
            // Activate the microphone recording
            await audioStream.startRecording();
          } 
          else if (msg.type === 'audio' && msg.audio) {
            setState('speaking');
            await audioStream.playResponseChunk(msg.audio);
          } 
          else if (msg.type === 'interrupted') {
            audioStream.stopPlayback();
            setState('idle');
            addLog('info', 'You cut Zoya off! Sassy attitude logged.');
          } 
          else if (msg.type === 'toolCall') {
            if (msg.name === 'openWebsite') {
              const url = msg.args.url;
              const siteName = msg.args.siteName || url;
              addLog('tool', `Zoya requested opening of website: ${siteName}`, { url });
              
              const handled = executeAndroidAction('openWebsite', { url });
              if (!handled) {
                try {
                  window.open(url, '_blank');
                } catch (e) {
                  console.warn('Iframe policy blocked window.open. URL added to activity logs.', e);
                }
                addNotification(`Opened website in a new tab: ${siteName} (Browser Fallback)`, 'success');
              } else {
                addNotification(`Opened website: ${siteName} via Native Android bridge`, 'success');
              }
            } 
            else if (msg.name === 'changeThemeColor') {
              const rawColor = msg.args.color;
              const targetTheme = mapColorToTheme(rawColor);
              setThemeColor(targetTheme);
              addLog('tool', `Zoya changed her glowing vibe to ${rawColor}!`);
              addNotification(`Visual theme updated: ${rawColor}`, 'success');
            }
            else if (msg.name === 'openApp') {
              const appName = msg.args.appName;
              addLog('tool', `Zoya requested opening application: ${appName}`);
              const handled = executeAndroidAction('openApp', { appName });
              if (!handled) {
                addNotification(`Requested opening '${appName}'. Android app is required for native launch. (Browser Fallback)`, 'warning');
              } else {
                addNotification(`Launched ${appName} via Native Android bridge`, 'success');
              }
            }
            else if (msg.name === 'openCamera') {
              addLog('tool', `Zoya requested opening device camera`);
              const handled = executeAndroidAction('openCamera');
              if (!handled) {
                addNotification(`Camera requested. Android app is required for native launch. (Browser Fallback)`, 'warning');
              } else {
                addNotification(`Camera launched via Native Android bridge`, 'success');
              }
            }
            else if (msg.name === 'openSettings') {
              addLog('tool', `Zoya requested opening system settings`);
              const handled = executeAndroidAction('openSettings');
              if (!handled) {
                addNotification(`System settings requested. Android app is required for native launch. (Browser Fallback)`, 'warning');
              } else {
                addNotification(`System settings launched via Native Android bridge`, 'success');
              }
            }
            else if (msg.name === 'sendSMS') {
              const { phoneNumber, message } = msg.args;
              addLog('info', `Zoya wants to send an SMS to ${phoneNumber}`);
              
              // Set pending action for user confirmation
              setPendingAction({
                id: Math.random().toString(36).substring(2, 11),
                type: 'sms',
                phoneNumber,
                message,
                onConfirm: () => {
                  const handled = executeAndroidAction('sendSMS', { phoneNumber, message });
                  if (handled) {
                    addLog('success', `SMS sent to ${phoneNumber} via Android Bridge`);
                    addNotification(`SMS dispatched to ${phoneNumber}`, 'success');
                  } else {
                    addLog('success', `SMS to ${phoneNumber}: "${message}" (Browser Simulated)`);
                    addNotification(`SMS simulated successfully!`, 'success');
                  }
                  setPendingAction(null);
                },
                onCancel: () => {
                  addLog('error', `SMS send to ${phoneNumber} was cancelled by user.`);
                  addNotification('SMS dispatch cancelled', 'info');
                  setPendingAction(null);
                }
              });
            }
            else if (msg.name === 'makeCall') {
              const { phoneNumber } = msg.args;
              addLog('info', `Zoya wants to call ${phoneNumber}`);
              
              // Set pending action for user confirmation
              setPendingAction({
                id: Math.random().toString(36).substring(2, 11),
                type: 'call',
                phoneNumber,
                onConfirm: () => {
                  const handled = executeAndroidAction('makeCall', { phoneNumber });
                  if (handled) {
                    addLog('success', `Dialer opened for ${phoneNumber} via Android Bridge`);
                    addNotification(`Calling ${phoneNumber}`, 'success');
                  } else {
                    addLog('success', `Call to ${phoneNumber} (Browser Simulated)`);
                    addNotification(`Call simulated successfully!`, 'success');
                  }
                  setPendingAction(null);
                },
                onCancel: () => {
                  addLog('error', `Call to ${phoneNumber} was cancelled by user.`);
                  addNotification('Call cancelled', 'info');
                  setPendingAction(null);
                }
              });
            }
          } 
          else if (msg.type === 'error') {
            setState('error');
            addLog('error', `Zoya Brain Error: ${msg.message}`);
            disconnect();
          }
        } catch (e: any) {
          console.error('Error handling websocket payload:', e);
        }
      };

      ws.onclose = () => {
        if (stateRef.current !== 'disconnected' && stateRef.current !== 'error') {
          addLog('info', 'Session connection closed by server.');
          disconnect();
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setState('error');
        addLog('error', 'WebSocket connection failed.');
        disconnect();
      };

    } catch (err: any) {
      console.error('Failed to establish voice call:', err);
      setState('error');
      addLog('error', err.message || 'Call failed to start.');
      disconnect();
    }
  };

  // Perform cleanup on component unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div 
      className={`min-h-screen bg-gradient-to-b ${activeTheme.bgGradient} text-slate-100 flex flex-col justify-between p-4 md:p-6 transition-all duration-1000 overflow-hidden relative font-sans`}
    >
      {/* Decorative cyber grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Futuristic glow rings in background */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full filter blur-[120px] opacity-15 pointer-events-none -top-40 -left-40 transition-all duration-1000"
        style={{ backgroundColor: activeTheme.accentBorder }}
      />
      <div 
        className="absolute w-[400px] h-[400px] rounded-full filter blur-[100px] opacity-10 pointer-events-none -bottom-45 -right-45 transition-all duration-1000"
        style={{ backgroundColor: activeTheme.accentBorder }}
      />

      {/* --- HEADER --- */}
      <header className="w-full flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold tracking-tighter shadow-lg text-white"
            style={{ 
              backgroundColor: activeTheme.accentBg,
              boxShadow: `0 0 10px ${activeTheme.accentGlow}`
            }}
          >
            Z
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-white uppercase flex items-center gap-1">
              Zoya <span className="text-[10px] lowercase font-mono opacity-60">v3.1-live</span>
            </h1>
            <p className="text-[9px] text-slate-400">Teasing real-time voice assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="p-2 rounded-lg bg-slate-950/40 border border-white/5 hover:border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            aria-label="Toggle user guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* --- MAIN STAGE --- */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 md:py-8 gap-6 z-10">
        {/* Glow Visualizer in center */}
        <GlowVisualizer 
          state={state} 
          theme={activeTheme} 
          audioStreamer={streamer} 
        />

        {/* Action controls and Activity Ledger */}
        <ZoyaControls
          state={state}
          theme={activeTheme}
          logs={logs}
          onToggleConnection={toggleConnection}
          onClearLogs={() => setLogs([])}
        />
      </main>

      {/* --- FOOTER --- */}
      <footer className="w-full text-center py-2 text-[10px] text-slate-500 z-10 flex flex-col md:flex-row items-center justify-between gap-2 border-t border-white/5 mt-4">
        <div className="flex items-center gap-1.5 font-mono">
          <span>AURA: {activeTheme.name}</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.accentBorder }} />
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          Made with <Heart className="w-3 h-3 text-pink-500 fill-pink-500/20" /> by Zoya Engine
        </div>
      </footer>

      {/* --- USER INTERACTIVE GUIDE PANEL --- */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/50 p-6 flex flex-col gap-4 text-left max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="font-semibold text-base text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-400" />
                  Meeting Zoya AI
                </h3>
                <button
                  onClick={() => setShowGuide(false)}
                  className="text-xs text-slate-400 hover:text-white uppercase font-mono tracking-wider cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              <div className="flex flex-col gap-3.5 text-sm leading-relaxed text-slate-300 font-mono text-xs">
                <p>
                  Zoya is a <span className="text-pink-400 font-bold">sassy, young, witty, and slightly flirty</span> female AI voice call companion. She loves to crack jokes, tease you, and hates robotic formal talk.
                </p>

                <div className="border-l-2 border-pink-500/40 pl-3 py-1 bg-pink-500/5 rounded-r-lg">
                  <span className="text-white font-bold block mb-1">🎙️ Audio-Only Experience</span>
                  There is no text chat! To talk, click the large central power/mic button. Let the microphone permissions guide you, and start speaking.
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-white font-bold">✨ Interactive Sassy Tools:</span>
                  <ul className="list-disc list-inside flex flex-col gap-1.5 text-slate-400 pl-1">
                    <li>
                      <span className="text-white">"Open Youtube"</span>: Zoya will instantly load pages for you. Click any generated link inside the activity ledger if it is blocked by your browser's iframe restrictions.
                    </li>
                    <li>
                      <span className="text-white">"Change theme to Emerald Green"</span>: Ask Zoya to change her clothes, aura, vibe, or visual color scheme (e.g. pink, red, emerald green, gold, blue, purple).
                    </li>
                    <li>
                      <span className="text-white">"What time is it?"</span>: Zoya will tell you the current date/time in a playful manner.
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                  <span className="text-purple-400 font-bold">📱 Hybrid Android Capabilities:</span>
                  <p className="text-[11px] text-slate-400 mb-1">Zoya is equipped with a native Android bridge that falls back gracefully on the web:</p>
                  <ul className="list-disc list-inside flex flex-col gap-1.5 text-slate-400 pl-1">
                    <li>
                      <span className="text-white">"Open camera" / "Open settings"</span>: Invokes physical camera feed or settings screen.
                    </li>
                    <li>
                      <span className="text-white">"Open Spotify" / "Open WhatsApp"</span>: Invokes device package loaders via `openApp`.
                    </li>
                    <li>
                      <span className="text-white">"Call my mom"</span>: Launches native dialer (`makeCall`) with safety confirmation modals.
                    </li>
                    <li>
                      <span className="text-white">"Send an SMS to ..."</span>: Composes SMS (`sendSMS`) with safety confirmation modals.
                    </li>
                  </ul>
                </div>

                <p className="text-slate-500 text-[11px] border-t border-white/5 pt-3">
                  Note: Zoya supports natural interruption. You can speak even while she is in the middle of talking to tease her back!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- PENDING NATIVE CONFIRMATION CARD OVERLAY --- */}
      <AnimatePresence>
        {pendingAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-pink-500/30 bg-slate-900/95 p-6 flex flex-col gap-4 text-left shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 animate-pulse" />
              
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-pink-500/10 text-pink-400">
                  {pendingAction.type === 'sms' ? <MessageSquare className="w-6 h-6" /> : <Phone className="w-6 h-6 animate-pulse" />}
                </div>
                <div>
                  <h4 className="text-sm font-semibold tracking-wide text-white uppercase font-mono">
                    {pendingAction.type === 'sms' ? 'SMS Confirmation' : 'Outgoing Call'}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">Zoya Assistant requests permission</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-white/5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-slate-400 font-mono">Target Number:</span>
                  <span className="text-white font-mono font-semibold">{pendingAction.phoneNumber}</span>
                </div>
                
                {pendingAction.message && (
                  <div className="mt-2 text-xs">
                    <span className="text-slate-400 font-mono block mb-1">Message Body:</span>
                    <p className="text-slate-200 bg-slate-900/80 p-2 rounded border border-white/5 italic font-mono text-[11px]">
                      "{pendingAction.message}"
                    </p>
                  </div>
                )}
              </div>

              <div className="text-[10px] text-pink-400/80 bg-pink-500/5 p-2.5 rounded-lg border border-pink-500/10 font-mono flex gap-1.5 items-start">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  This action triggers your physical device's native functions. Confirm to transmit.
                </span>
              </div>

              <div className="flex gap-2 w-full mt-1.5">
                <button
                  onClick={pendingAction.onCancel}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950/60 border border-white/5 hover:bg-slate-950/80 text-slate-400 hover:text-white transition-all font-mono text-xs cursor-pointer text-center"
                >
                  Decline
                </button>
                <button
                  onClick={pendingAction.onConfirm}
                  style={{ backgroundColor: activeTheme.accentBg, boxShadow: `0 0 10px ${activeTheme.accentGlow}` }}
                  className="flex-1 py-2.5 rounded-xl text-white hover:opacity-90 transition-all font-mono text-xs font-semibold cursor-pointer text-center"
                >
                  Confirm & Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- FLOATING TOAST NOTIFICATIONS --- */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-3 rounded-xl border flex items-center gap-2 shadow-lg backdrop-blur-md pointer-events-auto ${
                n.type === 'warning'
                  ? 'bg-amber-950/95 border-amber-500/30 text-amber-300'
                  : n.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950/95 border-white/10 text-slate-300'
              }`}
            >
              <div className="shrink-0">
                {n.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : n.type === 'success' ? (
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Info className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <p className="text-[11px] font-mono leading-tight">{n.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
