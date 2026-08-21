'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Terang', Icon: Sun },
  { id: 'dark', label: 'Gelap', Icon: Moon },
  { id: 'system', label: 'Sistem', Icon: Monitor },
];

/**
 * The document element is the source of truth — an inline script in <head>
 * stamps it before first paint, so there is no flash and no state to
 * duplicate. The component subscribes to that attribute instead of mirroring it.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === 'dark' || value === 'light' ? value : 'system';
}

function getServerSnapshot(): Theme {
  return 'system';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === 'system') localStorage.removeItem('ca-theme');
    else localStorage.setItem('ca-theme', theme);
  } catch {
    // Private browsing can refuse storage; the choice still applies to this tab.
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => applyTheme(id)}
          title={label}
          aria-label={`Tema ${label}`}
          aria-pressed={theme === id}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            theme === id ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Icon size={14} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}
