import type { ReactNode } from 'react';

/** A titled card section with optional subtitle/intro for sticky context. */
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
    <section className="rounded-2xl border border-line bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A labeled input row with helper microcopy and an optional unit affix. */
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
      <span className="block text-sm font-medium text-ink">{label}</span>
      <div className="relative mt-1">
        {children}
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            {unit}
          </span>
        )}
      </div>
      {help && <span className="mt-1 block text-xs leading-snug text-muted">{help}</span>}
    </label>
  );
}

const inputCls =
  'tabular w-full rounded-lg border border-line bg-white px-3 py-2 pr-12 text-right text-ink outline-none transition focus:border-citi-500 focus:ring-2 focus:ring-citi-200';

export function NumberInput({
  value,
  onChange,
  step,
  min,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <input
      type="number"
      className={inputCls}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}

export function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <input
      type="text"
      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none transition focus:border-citi-500 focus:ring-2 focus:ring-citi-200"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const styles =
    variant === 'primary'
      ? 'bg-citi-700 text-white shadow-sm hover:bg-citi-800'
      : 'border border-citi-200 bg-citi-50 text-citi-800 hover:bg-citi-100';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/** Validation status pill. */
export function StatusPill({ status, children }: { status: 'pass' | 'warn' | 'fail'; children: ReactNode }) {
  const map = {
    pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    fail: 'bg-rose-50 text-rose-700 border-rose-200',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${map[status]}`}>
      {children}
    </span>
  );
}

/** A headline figure with a caption. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular mt-1 font-display text-xl text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
