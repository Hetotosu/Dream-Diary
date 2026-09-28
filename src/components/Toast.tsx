'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        <div className={`toast${show ? ' show' : ''}`} role="status" aria-live="polite">
          {msg}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
