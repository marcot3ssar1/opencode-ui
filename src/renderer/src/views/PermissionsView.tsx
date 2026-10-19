import React, { useCallback } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ErrBox, toast, usePoll } from '../ui'
import { ApiError, request, shortId } from '../api'

interface PermissionRequest {
  id: string
  sessionID: string
  action: string
  resources: string[]
  message?: string
  save?: string[]
  metadata?: Record<string, unknown>
}

export default function PermissionsView(): React.ReactElement {
  const { directory, t } = useOc()

  const pending = usePoll<PermissionRequest[]>(
    async () => {
      const res = await request<{ data?: PermissionRequest[] }>('GET', '/api/permission/request', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as PermissionRequest[]
    },
    2500,
    [directory],
  )

  const reply = useCallback(
    async (req: PermissionRequest, decision: 'once' | 'always' | 'reject') => {
      try {
        await request('POST', `/api/session/${req.sessionID}/permission/${req.id}/reply`, {
          body: { decision },
        })
        toast('✓ ' + decision)
        pending.reload()
      } catch (e) {
        toast('✗ ' + String((e as ApiError).message))
      }
    },
    [pending],
  )

  return (
    <div className="pad">
      <Card
        title={t('permissions.title')}
        actions={
          <>
            <Badge tone={(pending.data ?? []).length > 0 ? 'busy' : 'muted'}>
              {t('permissions.pending')}: {(pending.data ?? []).length}
            </Badge>
            <Btn onClick={() => pending.reload()} small>
              ⟳
            </Btn>
          </>
        }
      >
        <ErrBox error={pending.error} />
        {(pending.data ?? []).length === 0 ? (
          <div className="muted">{t('permissions.none')}</div>
        ) : (
          <div className="perm-list">
            {(pending.data ?? []).map((req) => (
              <div key={req.id} className="perm-card">
                <div className="perm-head">
                  <Badge tone="warn">{req.action}</Badge>
                  <span className="mono muted">{t('permissions.session')} {shortId(req.sessionID, 10)}</span>
                </div>
                {req.message && <div className="perm-msg">{req.message}</div>}
                <div className="perm-res">
                  {(req.resources ?? []).map((r, i) => (
                    <div key={i} className="mono selectable perm-res-item">
                      {r}
                    </div>
                  ))}
                </div>
                {req.save && req.save.length > 0 && (
                  <div className="mono muted" style={{ fontSize: 10.5 }}>
                    {t('permissions.always')} {req.save.join(', ')}
                  </div>
                )}
                <div className="perm-actions">
                  <Btn tone="primary" small onClick={() => void reply(req, 'once')}>
                    ✓ {t('permissions.once')}
                  </Btn>
                  <Btn small onClick={() => void reply(req, 'always')}>
                    ⇅ {t('permissions.always')}
                  </Btn>
                  <Btn tone="danger" small onClick={() => void reply(req, 'reject')}>
                    ✕ {t('permissions.reject')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
