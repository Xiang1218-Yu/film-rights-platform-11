import { useCallback, useEffect, useState } from 'react';

type Conflict = { severity: string; assetA: string; assetB: string; reason: string };
type AuditEvent = {
  id: string; seq: number; action: string; entity: string; entityId: string; actor: string;
  at: string; recordedAt: string; result: 'success' | 'failure';
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  relatedIds: string[]; details: string; legacy: boolean; incomplete: boolean; redacted: boolean;
  context?: { conflicts?: Conflict[] };
};
type Page = { events: AuditEvent[]; nextCursor: string | null; watermark: number; total: number; facets: { actors: string[]; actions: string[]; entities: string[] } };
type Filters = { entity: string; actor: string; action: string; result: string; from: string; to: string; entityId: string };

const EMPTY: Filters = { entity: '', actor: '', action: '', result: '', from: '', to: '', entityId: '' };
const ENTITY_LABEL: Record<string, string> = { budget: '预算', asset: '资产', approval: '审批', contract: '合同', delivery: '交付' };

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body as T;
}
const fmtTime = (iso: string) => iso.replace('T', ' ').slice(0, 19);
const fmtValue = (value: unknown) => typeof value === 'number' ? value.toLocaleString('zh-CN') : String(value);

function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (!keys.length) return null;
  return <div className="audit-diff">{keys.map(key => {
    const from = before?.[key]; const to = after?.[key];
    return <div className="audit-diff-row" key={key}><span>{key}</span><em>{from === undefined ? '—' : fmtValue(from)}</em><i>→</i><b>{to === undefined ? '—' : fmtValue(to)}</b></div>;
  })}</div>;
}

export default function AuditExplorer({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [role, setRole] = useState<'viewer' | 'auditor'>('viewer');
  const [page, setPage] = useState<Page>();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (cursor?: string, watermark?: number) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      params.set('role', role);
      if (cursor) params.set('cursor', cursor);
      if (watermark !== undefined) params.set('watermark', String(watermark));
      const data = await request<Page>(`/projects/${projectId}/audit?${params}`);
      setPage(data);
      setEvents(previous => cursor ? [...previous, ...data.events] : data.events);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '审计查询失败'); }
    finally { setLoading(false); }
  }, [filters, role, projectId]);

  useEffect(() => { setEvents([]); void load(); }, [load]);

  const set = (key: keyof Filters) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters(current => ({ ...current, [key]: event.target.value }));
  const facets = page?.facets ?? { actors: [], actions: [], entities: [] };

  return <div className="audit">
    <section className="panel wide audit-filters">
      <label>实体类型<select value={filters.entity} onChange={set('entity')}><option value="">全部</option>{facets.entities.map(item => <option key={item} value={item}>{ENTITY_LABEL[item] ?? item}</option>)}</select></label>
      <label>操作者<select value={filters.actor} onChange={set('actor')}><option value="">全部</option>{facets.actors.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>动作<select value={filters.action} onChange={set('action')}><option value="">全部</option>{facets.actions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>结果<select value={filters.result} onChange={set('result')}><option value="">全部</option><option value="success">成功</option><option value="failure">失败</option></select></label>
      <label>起始日期<input type="date" value={filters.from} onChange={set('from')} /></label>
      <label>截止日期<input type="date" value={filters.to} onChange={set('to')} /></label>
      <label>可见范围<select value={role} onChange={event => setRole(event.target.value as 'viewer' | 'auditor')}><option value="viewer">访客（脱敏）</option><option value="auditor">审计员</option></select></label>
      <button onClick={() => setFilters(EMPTY)}>重置</button>
      {filters.entityId && <span className="audit-chip">实体 {filters.entityId}<b onClick={() => setFilters(current => ({ ...current, entityId: '' }))}> ×</b></span>}
    </section>
    {error && <div className="audit-error">{error}</div>}
    <div className="audit-meta"><span>共 <b>{page?.total ?? 0}</b> 条事件</span><span>快照水位 #{page?.watermark ?? '—'}</span><span>按因果序（时间, seq）升序</span>{loading && <span>载入中…</span>}</div>
    <section className="audit-trail">
      {events.map(event => <article className={`audit-event ${event.result}`} key={event.id}>
        <header>
          <span className="audit-seq">#{event.seq}</span>
          <time>{fmtTime(event.at)}</time>
          <b className="audit-action">{event.action}</b>
          <span className="audit-entity">{ENTITY_LABEL[event.entity] ?? event.entity} · {event.entityId}</span>
          <span className="audit-actor">{event.actor}</span>
          {event.result === 'failure' && <strong className="flag failure">失败</strong>}
          {event.legacy && <strong className="flag">旧事件</strong>}
          {event.incomplete && <strong className="flag warn">不完整</strong>}
          {event.redacted && <strong className="flag masked">已脱敏</strong>}
        </header>
        {event.details && <p>{event.details}</p>}
        <Diff before={event.before} after={event.after} />
        {event.relatedIds.length > 0 && <div className="audit-related">关联 {event.relatedIds.map(id => <code key={id} onClick={() => setFilters(current => ({ ...current, entityId: id }))}>{id}</code>)}</div>}
        {(event.context?.conflicts?.length ?? 0) > 0 && <div className="audit-conflicts">
          <small>当时版权冲突 {event.context!.conflicts!.length} 条</small>
          {event.context!.conflicts!.map((conflict, index) => <div key={index}><strong className={conflict.severity}>{conflict.severity === 'critical' ? 'CRITICAL' : 'WARNING'}</strong> {conflict.assetA} ↔ {conflict.assetB}<small>{conflict.reason}</small></div>)}
        </div>}
      </article>)}
      {!loading && events.length === 0 && <div className="empty">当前筛选条件下没有审计事件。</div>}
    </section>
    {page?.nextCursor && <button className="audit-more" disabled={loading} onClick={() => void load(page.nextCursor ?? undefined, page.watermark)}>{loading ? '载入中…' : '加载更多'}</button>}
  </div>;
}
