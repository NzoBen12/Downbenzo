import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface ToastItem { id: number; message: string; kind: 'info' | 'success' | 'error' }
interface ToastApi { show: (message: string, kind?: ToastItem['kind']) => void }

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = ++counter;
    setItems((l) => [...l, { id, message, kind }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notificaciones" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button className="btn ghost sm" style={{ color: '#fff' }} aria-label="Cerrar notificación" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requiere ToastProvider');
  return ctx;
}
