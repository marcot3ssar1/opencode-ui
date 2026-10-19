import React from 'react'
import { fmtMoney, fmtNum } from '../api'
import { Badge, Card, ErrBox, usePoll } from '../ui'
import { request } from '../api'

interface TokenUsage {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

interface ModelUsage {
  model?: { id?: string; providerID?: string; variant?: string }
  steps?: number
  tokens?: TokenUsage
  cost?: number
}

interface StatsInfo {
  range?: { from?: number; to?: number }
  sessions?: number
  subagents?: number
  prompts?: number
  steps?: number
  tokens?: TokenUsage
  cost?: number
  tools?: unknown
  activeDays?: number
  streak?: number
  activity?: Array<{ date?: string; steps?: number }>
  models?: ModelUsage[]
}

export default function StatsView(): React.ReactElement {
  const stats = usePoll<StatsInfo>(
    async () => {
      // il body è { data: {...statistiche} }: entra nel .data (era il bug dei trattini)
      const res = await request<{ data?: StatsInfo }>('GET', '/api/experimental/session/stats')
      return (res.data ?? res) as StatsInfo
    },
    60000,
    [],
  )

  const tk = stats.data?.tokens ?? {}
  const activity = stats.data?.activity ?? []
  const maxSteps = Math.max(1, ...activity.map((a) => a.steps ?? 0))

  const toolsInfo = (stats.data?.tools ?? {}) as {
    mode?: string
    totals?: { calls?: number; succeeded?: number; failed?: number; unfinished?: number }
  }
  const tt = toolsInfo.totals ?? {}
  const eff = tt.calls ? Math.round(((tt.succeeded ?? 0) / tt.calls) * 100) : null

  const rg = stats.data?.range

  return (
    <div className="pad">
      <ErrBox error={stats.error} />
      <div className="muted" style={{ marginBottom: 8 }}>
        {rg?.from ? `Dati dal ${new Date(rg.from).toLocaleDateString('it-IT')} al ${new Date(rg.to ?? Date.now()).toLocaleDateString('it-IT')}` : ''}{' '}
        (aggiornamento ogni minuto)
      </div>
      <div className="stat-grid">
        <Stat label="Sessioni" value={fmtNum(stats.data?.sessions)} />
        <Stat label="Subagenti" value={fmtNum(stats.data?.subagents)} />
        <Stat label="Prompt" value={fmtNum(stats.data?.prompts)} />
        <Stat label="Step" value={fmtNum(stats.data?.steps)} />
        <Stat label="Costo" value={fmtMoney(stats.data?.cost)} />
        <Stat label="Giorni attivi" value={fmtNum(stats.data?.activeDays)} />
        <Stat label="Streak" value={fmtNum(stats.data?.streak)} />
        <Stat label="Token in/out" value={`${fmtNum(tk.input)} / ${fmtNum(tk.output)}`} />
        <Stat
          label="Cache r/w"
          value={`${fmtNum((tk as { cache?: { read?: number; write?: number } }).cache?.read)} / ${
            fmtNum((tk as { cache?: { read?: number; write?: number } }).cache?.write)
          }`}
        />
      </div>

      <Card title="Attività (step/giorno)">
        <div className="activity">
          {activity.slice(-60).map((a, idx) => (
            <div
              key={`${a.date}-${idx}`}
              className="activity-bar"
              style={{ height: `${Math.max(4, ((a.steps ?? 0) / maxSteps) * 70)}px` }}
              title={`${a.date}: ${a.steps ?? 0} step`}
            />
          ))}
          {activity.length === 0 && <div className="muted">—</div>}
        </div>
      </Card>

      <div className="cards">
        <Card title="Per modello">
          <table className="table">
            <thead>
              <tr>
                <th>model</th>
                <th>step</th>
                <th>tokens in/out/r</th>
                <th>costo</th>
              </tr>
            </thead>
            <tbody>
              {(stats.data?.models ?? []).map((mm, i) => (
                <tr key={i}>
                  <td className="mono selectable">
                    {mm.model?.providerID}/{mm.model?.id ?? '—'}
                    {mm.model?.variant ? <span className="muted"> · {mm.model.variant}</span> : null}
                  </td>
                  <td className="mono">{mm.steps ?? 0}</td>
                  <td className="mono">
                    {fmtNum(mm.tokens?.input)} / {fmtNum(mm.tokens?.output)} / {fmtNum(mm.tokens?.reasoning)}
                  </td>
                  <td>{fmtMoney(mm.cost)}</td>
                </tr>
              ))}
              {(stats.data?.models ?? []).length === 0 && (
                <tr><td colSpan={4} className="muted">—</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Tool">
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Stat label="Chiamate" value={fmtNum(tt.calls)} />
            <Stat label="Ok" value={fmtNum(tt.succeeded)} />
            <Stat label="Fallite" value={fmtNum(tt.failed)} />
            <Stat label="Inattive" value={fmtNum(tt.unfinished)} />
          </div>
          <div style={{ marginTop: 8 }}>
            {eff !== null ? (
              <Badge tone={eff >= 95 ? 'ok' : eff >= 85 ? 'info' : 'warn'}>Efficienza {eff}%</Badge>
            ) : (
              <Badge tone="muted">—</Badge>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="stat-card">
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
