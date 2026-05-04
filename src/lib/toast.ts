import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
  createdAt: number;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'createdAt'> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? uid();
    const toast: Toast = {
      id,
      title: t.title,
      description: t.description,
      variant: t.variant,
      durationMs: t.durationMs,
      createdAt: Date.now(),
    };

    set((s) => ({
      toasts: [toast, ...s.toasts].slice(0, 5),
    }));

    return id;
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => set({ toasts: [] }),
}));

export function toast(input: {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}) {
  return useToastStore.getState().push({
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'info',
    durationMs: input.durationMs ?? 3200,
  });
}
