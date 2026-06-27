import type { ReactNode } from 'react';

/** A glass card surface. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-glass backdrop-blur-xl ${className}`}>{children}</div>
  );
}

/** A titled section on a glass surface. */
export function Section({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export function Field({
  label,
  help,
  unit,
  children,
}: {
  label: string;
  help?: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted">{label}</span>
      <div className="relative mt-1.5">
        {children}
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
            {unit}
          </span>
        )}
      </div>
      {help && <span className="mt-1 block text-xs leading-snug text-muted/80">{help}</span>}
    </label>
  );
}

const fieldCls =
  'w-full rounded-xl border border-line bg-white/5 px-3 py-2 text-ink outline-none transition placeholder:text-muted/60 focus:border-citi-500/70 focus:bg-white/[0.07] focus:ring-2 focus:ring-citi-500/25';

export function NumberInput({
  value,
  onChange,
  step,
  min,
  unit,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  unit?: boolean;
}) {
  return (
    <input
      type="number"
      className={`tabular text-right ${unit ? 'pr-10' : ''} ${fieldCls}`}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className={fieldCls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  onSubmit,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
}) {
  return (
    <textarea
      className={`${fieldCls} resize-none leading-relaxed`}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') onSubmit();
      }}
    />
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'subtle';
  disabled?: boolean;
  type?: 'button' | 'submit';
  size?: 'md' | 'sm';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const sizing = size === 'sm' ? 'px-4 py-1.5 text-sm' : 'px-5 py-2.5 text-sm';
  const styles =
    variant === 'primary'
      ? 'bg-citi-500 text-white shadow-[0_0_24px_-6px] shadow-citi-500/60 hover:bg-citi-400'
      : variant === 'subtle'
        ? 'border border-line bg-white/5 text-ink hover:bg-white/10'
        : 'text-citi-300 hover:text-citi-200';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizing} ${styles}`}>
      {children}
    </button>
  );
}

/** A selectable chip. */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-citi-400/60 bg-citi-500/15 text-citi-100'
          : 'border-line bg-white/[0.03] text-muted hover:border-citi-400/40 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** A chat message bubble. */
export function Bubble({ from, children }: { from: 'assistant' | 'user'; children: ReactNode }) {
  const isUser = from === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-citi-500/15 text-ink ring-1 ring-citi-400/30'
            : 'bg-white/[0.05] text-ink ring-1 ring-line'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block size-4 animate-spin rounded-full border-2 border-citi-300/40 border-t-citi-300" />
  );
}

export function StatusPill({ status, children }: { status: 'pass' | 'warn' | 'fail'; children: ReactNode }) {
  const map = {
    pass: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
    warn: 'bg-amber-500/10 text-amber-300 border-amber-400/30',
    fail: 'bg-rose-500/10 text-rose-300 border-rose-400/30',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${map[status]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
