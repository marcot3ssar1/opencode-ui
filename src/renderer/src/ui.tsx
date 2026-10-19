import React, { useEffect, useRef, useState } from 'react'
import { useOc } from './state'

export function Card({ title, children, actions, className }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <div className="card-title">{title}</div>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'err' | 'info' | 'busy' }): React.ReactElement {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export function Btn({ children, onClick, tone = 'default', disabled, title, small }: { children: React.ReactNode; onClick?: () => void; tone?: 'default' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; title?: string; small?: boolean }): React.ReactElement {
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`btn btn-${tone} ${small ? 'btn-sm' : ''}`}>
      {children}
    </button>
  )
}

export function ErrBox({ error }: { error: unknown }): React.ReactElement | null {
  if (!error) return null
  const text = typeof error === 'string' ? error : JSON.stringify(error)
  return <div className="errbox">{text}</div>
}

export function TextInput({ value, onChange, placeholder, onEnter, width, autoFocus, password }: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void; width?: number; autoFocus?: boolean; password?: boolean }): React.ReactElement {
  return (
    <input
      className="input"
      style={width ? { width } : undefined}
      type={password ? 'password' : 'text'}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.()
      }}
    />
  )
}

export function Select<T extends string | undefined>({ value, onChange, options, width }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; width?: number }): React.ReactElement {
  return (
    <select className="input select" style={width ? { width } : undefined} value={value ?? ''} onChange={(e) => {
      const selected = e.target.value as T
      onChange(selected === '' ? (undefined as T) : selected)
    }}>
      {options.map((o) => (
        <option key={String(o.value ?? '__none')} value={o.value ?? ''}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Spinner(): React.ReactElement {
  return <span className="spinner" />
}

/**
 * Two-step confirmation button. window.confirm() is not available in Electron
 * renderers, so destructive actions arm on the first click and act on the second.
 */
export function ConfirmBtn({
  children,
  label,
  onConfirm,
  tone = 'default',
  small = true,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onConfirm: () => void
  tone?: 'default' | 'primary' | 'danger' | 'ghost'
  small?: boolean
  disabled?: boolean
}): React.ReactElement {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <Btn
      small={small}
      tone={armed ? 'danger' : tone}
      disabled={disabled}
      title={label}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? '⚠ ' + label : children}
    </Btn>
  )
}

/** Periodic data polling while the view is mounted. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []): { data: T | null; error: unknown; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      setLoading(true)
      try {
        const d = await fnRef.current()
        if (alive) {
          setData(d)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    const iv = setInterval(run, ms)
    return () => {
      alive = false
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, tick, ...deps])

  return { data, error, reload: () => setTick((x) => x + 1), loading }
}

export function toast(msg: string): void {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => {
    el.classList.add('toast-out')
    setTimeout(() => el.remove(), 400)
  }, 2600)
}

/** Keeps a failing view from unmounting the whole app (black screen). */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { error: unknown }
> {
  override state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }
  override componentDidCatch(error: unknown): void {
    console.error('[OpenCode UI] errore vista:', error)
  }
  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="pad">
          <Card title={(this.props.label ?? 'vista') + ' — ' + 'errore inatteso'}>
            <ErrBox error={this.state.error} />
            <div className="muted" style={{ marginBottom: 10 }}>
              La vista è stata interrotta ma il resto dell'app continua a funzionare.
            </div>
            <div className="row-gap">
              <Btn tone="primary" onClick={() => this.setState({ error: null })}>
                ↺ Riprova
              </Btn>
              <Btn onClick={() => window.location.reload()}>⟳ Ricarica app</Btn>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
