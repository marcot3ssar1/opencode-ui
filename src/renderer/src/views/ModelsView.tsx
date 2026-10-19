import React, { useMemo, useState } from 'react'
import { useOc } from '../state'
import { Badge, Card, ErrBox, TextInput, usePoll } from '../ui'
import { fmtMoney, fmtNum, request } from '../api'

interface ModelInfo {
  id: string
  modelID?: string
  providerID: string
  name?: string
  status?: string
  enabled?: boolean
  limit?: { context?: number; output?: number; input?: number }
  cost?: Array<{ input?: number; output?: number; tier?: { size?: number } }>
}

interface ProviderInfo {
  id: string
  name?: string
  activation?: string
  integrationID?: string
}

export default function ModelsView(): React.ReactElement {
  const { directory, t } = useOc()
  const [filter, setFilter] = useState('')

  const providers = usePoll<ProviderInfo[]>(
    async () => {
      const res = await request<{ data?: ProviderInfo[] }>('GET', '/api/provider', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as ProviderInfo[]
    },
    60000,
    [directory],
  )

  const models = usePoll<ModelInfo[]>(
    async () => {
      const res = await request<{ data?: ModelInfo[] }>('GET', '/api/model', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as ModelInfo[]
    },
    60000,
    [directory],
  )

  const rows = useMemo(() => {
    const list = models.data ?? []
    const f = filter.trim().toLowerCase()
    if (!f) return list
    return list.filter((m) => `${m.providerID}/${m.id} ${m.name ?? ''}`.toLowerCase().includes(f))
  }, [models.data, filter])

  return (
    <div className="pad">
      <Card title={t('nav.mcp') === '' ? '' : undefined} className="hidden-card" >
        <span />
      </Card>

      <Card
        title={t('models.title')}
        actions={
          <>
            <TextInput value={filter} onChange={setFilter} placeholder={t('common.search')} width={220} />
            <Badge tone="muted">{rows.length} models · {(providers.data ?? []).length} providers</Badge>
          </>
        }
      >
        <ErrBox error={models.error ?? providers.error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('models.provider')}</th>
                <th>{t('common.name')}</th>
                <th className="mono">id</th>
                <th>{t('models.context')}</th>
                <th>{t('models.output')}</th>
                <th>{t('models.costIn')}</th>
                <th>{t('models.costOut')}</th>
                <th>{t('models.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 400).map((m) => {
                const cost = m.cost?.[m.cost.length - 1]
                return (
                  <tr key={m.providerID + '/' + m.id}>
                    <td className="mono">{m.providerID}</td>
                    <td className="selectable">{m.name ?? '—'}</td>
                    <td className="mono muted">{m.id}</td>
                    <td className="mono">{fmtNum(m.limit?.context)}</td>
                    <td className="mono">{fmtNum(m.limit?.output)}</td>
                    <td className="mono">{fmtMoney(cost?.input)}</td>
                    <td className="mono">{fmtMoney(cost?.output)}</td>
                    <td>
                      <Badge tone={m.enabled === false ? 'muted' : m.status === 'deprecated' ? 'warn' : 'ok'}>
                        {m.enabled === false ? 'disabled' : (m.status ?? 'active')}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">{t('common.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('models.provider') + 's'}>
        <div className="provider-grid">
          {(providers.data ?? []).map((p) => (
            <div key={p.id} className="provider-card">
              <div className="mono">{p.id}</div>
              <div className="muted">{p.name ?? ''}</div>
              <Badge tone={p.activation === 'disabled' ? 'muted' : 'ok'}>{p.activation ?? 'auto'}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
