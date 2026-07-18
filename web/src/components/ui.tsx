import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Inbox, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="BML">
      <span className="brand__mark" aria-hidden="true">
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand__copy">
          <strong>BML</strong>
          <small>Rail intelligence</small>
        </span>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  className = ''
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel__header">
          <div className="panel__title-wrap">
            {icon && <span className="panel__icon">{icon}</span>}
            <div>
              {title && <h2>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  meta,
  icon,
  tone = 'teal'
}: {
  label: string;
  value: ReactNode;
  meta?: string;
  icon: ReactNode;
  tone?: 'teal' | 'green' | 'red' | 'amber' | 'blue';
}) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      {meta && <span className="stat-card__meta">{meta}</span>}
    </article>
  );
}

export function StatusBadge({
  children,
  tone
}: {
  children: ReactNode;
  tone?: 'green' | 'red' | 'amber' | 'teal' | 'muted' | 'blue';
}) {
  const resolved = tone ?? resolveTone(String(children));
  return <span className={`status-badge status-badge--${resolved}`}><i />{children}</span>;
}

function resolveTone(value: string): 'green' | 'red' | 'amber' | 'teal' | 'muted' | 'blue' {
  const normalized = value.toLowerCase();
  if (['online', 'active', 'sent', 'completed', 'enabled', 'open'].some((item) => normalized.includes(item))) {
    return 'green';
  }
  if (['off', 'offline', 'failed', 'error', 'critical', 'disabled'].some((item) => normalized.includes(item))) {
    return 'red';
  }
  if (['queued', 'idle', 'medium', 'pending'].some((item) => normalized.includes(item))) {
    return 'amber';
  }
  if (normalized.includes('low')) return 'blue';
  return 'muted';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} {...props}>
      {props.disabled && props.type === 'submit' ? <LoaderCircle className="spin" size={16} /> : null}
      {children}
    </button>
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search-input">
      <Search size={16} aria-hidden="true" />
      <input {...props} type="search" />
    </label>
  );
}

export function LoadingState({ label = 'Fetching live data' }: { label?: string }) {
  return (
    <div className="state-view">
      <LoaderCircle className="spin" size={26} />
      <strong>{label}</strong>
      <span>Syncing with BML services</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry
}: {
  error: Error | string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-view state-view--error">
      <AlertTriangle size={28} />
      <strong>Couldn&apos;t load this view</strong>
      <span>{typeof error === 'string' ? error : error.message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={15} />
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-view">
      <span className="state-view__empty"><Inbox size={26} /></span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md'
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`modal modal--${width}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'is-active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
