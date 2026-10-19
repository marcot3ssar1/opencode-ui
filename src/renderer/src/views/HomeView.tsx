import React, { useMemo, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, usePoll } from '../ui'
import { shortId } from '../api'

export default function HomeView(): React.ReactElement {
  const { t, directory, server, events, refreshServer } = useOc()
  const [busy, setBusy] = useState(false)

  const lastEvents = useMemo(() => events.slice(-30).reverse(), [events])

  return (
    <div className="pad">
      <div className="cards">
        <Card title={t('home.server')} actions={<Btn small onClick={() => void refreshServer()}>⟳</Btn>}>
          {server?.ok ? (
            <table className="kv">
              <tbody>
                <tr>
                  <th>{t('home.version')}</th>
                  <td className="mono">{server.version ?? '—'}</td>
                </tr>
                <tr>
                  <th>{t('home.pid')}</th>
                  <td className="mono">{server.pid ?? '—'}</td>
                </tr>
                <tr>
                  <th>{t('home.serverUrl')}</th>
                  <td className="mono">{server.url ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div>
              <Badge tone="err">{t('top.disconnected')}</Badge>
              <div className="muted" style={{ marginTop: 8 }}>{String(server?.error ?? '')}</div>
            </div>
          )}
        </Card>

        <Card title={t('home.location')}>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t('top.directory')}</th>
                <td className="mono selectable">{directory}</td>
              </tr>
              <tr>
                <th>{t('home.project')}</th>
                <td className="mono">{shortId(server?.location?.project?.id ?? undefined, 12) || '—'}</td>
              </tr>
              <tr>
                <th>canonical</th>
                <td className="mono selectable">{server?.location?.project?.canonical ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title={t('home.service')}>
          <div className="row-gap">
            <Btn
              small
              tone="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await window.oc.stopService()
                setBusy(false)
                void refreshServer()
              }}
            >
              ■ {t('home.stopService')}
            </Btn>
            <Btn small onClick={() => void window.oc.reopenService()}>
              ⟳ {t('top.reopen')}
            </Btn>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {t('home.serviceDesc')}
          </div>
        </Card>
      </div>

      <Card title={t('home.eventlog')}>
        <div className="eventlog mono">
          {lastEvents.length === 0 && <div className="muted">{t('home.waiting')}</div>}
          {lastEvents.map((e) => (
            <div key={e._seq} className="eventrow">
              <span className="ev-type">{e.type}</span>
              {e.properties && Object.keys(e.properties).length > 0 && (
                <span className="ev-detail">{JSON.stringify(e.properties).slice(0, 220)}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
