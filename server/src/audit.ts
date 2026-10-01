// 审计事件存储与查询引擎。
// 完整性约定：
// - 事件追加即分配单调递增 seq（因果序），同 id 重复重放只保留首次写入；
// - 缺字段 / 半写入事件不丢弃，规范化后打 incomplete 标记，仍按 (at, seq) 参与排序；
// - 查询按 (at, seq) 升序输出，游标 + watermark 快照保证翻页期间新写入的事件
//   不会造成重复、遗漏或顺序抖动；
// - 敏感字段按角色脱敏，审计员可见原值，其余角色看到 ***。

export type AuditResult = 'success' | 'failure';
export type AuditRole = 'auditor' | 'viewer';

export interface RightsConflictSnapshot { severity: string; assetA: string; assetB: string; reason: string; }

export interface AuditEventInput {
  id?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  actor?: string;
  at?: string;
  projectId?: string | null;
  result?: AuditResult;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  relatedIds?: string[];
  details?: string;
  sensitiveFields?: string[];
  context?: { conflicts?: RightsConflictSnapshot[] };
  legacy?: boolean;
}

export interface AuditEvent {
  id: string;
  seq: number;
  projectId: string | null;
  action: string;
  entity: string;
  entityId: string;
  actor: string;
  at: string;
  recordedAt: string;
  result: AuditResult;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  relatedIds: string[];
  details: string;
  sensitiveFields: string[];
  context?: { conflicts?: RightsConflictSnapshot[] };
  legacy: boolean;
  incomplete: boolean;
}

export type AuditEventView = AuditEvent & { redacted: boolean };

export interface AuditQuery {
  projectId: string;
  entity?: string;
  entityId?: string;
  actor?: string;
  action?: string;
  result?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  watermark?: number;
  role?: AuditRole;
}

export interface AuditPage {
  events: AuditEventView[];
  nextCursor: string | null;
  watermark: number;
  total: number;
  facets: { actors: string[]; actions: string[]; entities: string[] };
}

export class AuditQueryError extends Error {
  constructor(message: string) { super(message); this.name = 'AuditQueryError'; }
}

const events: AuditEvent[] = [];
const byId = new Map<string, AuditEvent>();
let seqCounter = 0;
let resolveProject: (entity: string, entityId: string) => string | null = () => null;

export function registerProjectResolver(resolver: (entity: string, entityId: string) => string | null) { resolveProject = resolver; }

const MASK = '***';
const UNKNOWN = '未知';
// 变更类动作若缺少前后值，视为半写入
const DIFF_ACTIONS = new Set(['UPDATE', 'ADJUST', 'APPROVED', 'REJECTED', 'LOCK']);

export function appendAuditEvent(input: AuditEventInput): { event: AuditEvent; created: boolean } {
  if (input.id) {
    const existing = byId.get(input.id);
    if (existing) return { event: existing, created: false };
  }
  const seq = ++seqCounter;
  const recordedAt = new Date().toISOString();
  const missing: string[] = [];
  let at = input.at ?? '';
  if (Number.isNaN(Date.parse(at))) { missing.push('at'); at = recordedAt; }
  const action = input.action?.trim() ? input.action.trim().toUpperCase() : (missing.push('action'), 'UNKNOWN');
  const entity = input.entity?.trim() ? input.entity.trim() : (missing.push('entity'), UNKNOWN);
  const entityId = input.entityId?.trim() ? input.entityId.trim() : (missing.push('entityId'), UNKNOWN);
  const actor = input.actor?.trim() ? input.actor.trim() : (missing.push('actor'), UNKNOWN);
  const before = input.before ?? null;
  const after = input.after ?? null;
  if (DIFF_ACTIONS.has(action) && !before && !after) missing.push('diff');
  const event: AuditEvent = {
    id: input.id ?? `AUD-${seq}`,
    seq,
    projectId: input.projectId !== undefined ? input.projectId : resolveProject(entity, entityId),
    action,
    entity,
    entityId,
    actor,
    at,
    recordedAt,
    result: input.result === 'failure' ? 'failure' : 'success',
    before,
    after,
    relatedIds: [...new Set(input.relatedIds ?? [])],
    details: input.details ?? '',
    sensitiveFields: input.sensitiveFields ?? [],
    context: input.context,
    legacy: input.legacy === true,
    incomplete: missing.length > 0
  };
  events.push(event);
  byId.set(event.id, event);
  return { event, created: true };
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR = /^(-?\d+)\|(\d+)$/;

// 时间边界：日期型按当天起止展开，完整 ISO 原样解析；两端均为闭区间
function boundary(value: string | undefined, kind: 'from' | 'to'): number | null {
  if (value === undefined || value === '') return null;
  const iso = DAY_ONLY.test(value) ? `${value}T${kind === 'from' ? '00:00:00.000' : '23:59:59.999'}Z` : value;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new AuditQueryError(`无法解析的时间边界：${value}`);
  return ms;
}

function view(event: AuditEvent, role: AuditRole): AuditEventView {
  if (role === 'auditor' || event.sensitiveFields.length === 0) return { ...event, redacted: false };
  const mask = (obj: Record<string, unknown> | null) => obj
    ? Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, event.sensitiveFields.includes(key) ? MASK : value]))
    : obj;
  return {
    ...event,
    before: mask(event.before),
    after: mask(event.after),
    details: event.sensitiveFields.includes('details') ? MASK : event.details,
    redacted: true
  };
}

export function queryAuditEvents(query: AuditQuery): AuditPage {
  if (!query.projectId) throw new AuditQueryError('缺少项目范围，审计查询必须限定项目');
  let watermark = seqCounter;
  if (query.watermark !== undefined) {
    if (!Number.isInteger(query.watermark) || query.watermark < 0) throw new AuditQueryError('无效的快照水位');
    watermark = Math.min(query.watermark, seqCounter);
  }
  const fromMs = boundary(query.from, 'from');
  const toMs = boundary(query.to, 'to');
  if (fromMs !== null && toMs !== null && fromMs > toMs) throw new AuditQueryError('时间范围起点晚于终点');
  if (query.result !== undefined && query.result !== '' && query.result !== 'success' && query.result !== 'failure') throw new AuditQueryError(`无效的结果筛选：${query.result}`);
  let limit = 20;
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1) throw new AuditQueryError('无效的分页大小');
    limit = Math.min(query.limit, 100);
  }
  let cursor: { ms: number; seq: number } | null = null;
  if (query.cursor) {
    const match = CURSOR.exec(query.cursor);
    if (!match) throw new AuditQueryError('无效的分页游标');
    cursor = { ms: Number(match[1]), seq: Number(match[2]) };
  }

  // 项目范围 + 快照水位是硬边界：跨项目事件与水线之后的新事件一律不可见
  const seen = new Set<string>();
  const scoped = events.filter(event => {
    if (event.projectId !== query.projectId || event.seq > watermark || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  const facets = {
    actors: [...new Set(scoped.map(event => event.actor))].sort(),
    actions: [...new Set(scoped.map(event => event.action))].sort(),
    entities: [...new Set(scoped.map(event => event.entity))].sort()
  };

  const matched = scoped.filter(event =>
    (!query.entity || event.entity === query.entity) &&
    (!query.entityId || event.entityId === query.entityId) &&
    (!query.actor || event.actor === query.actor) &&
    (!query.action || event.action === query.action) &&
    (!query.result || event.result === query.result) &&
    (fromMs === null || Date.parse(event.at) >= fromMs) &&
    (toMs === null || Date.parse(event.at) <= toMs)
  ).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);

  const remaining = cursor
    ? matched.filter(event => { const ms = Date.parse(event.at); return ms > cursor.ms || (ms === cursor.ms && event.seq > cursor.seq); })
    : matched;

  const pageEvents = remaining.slice(0, limit);
  const last = pageEvents[pageEvents.length - 1];
  const nextCursor = remaining.length > limit && last ? `${Date.parse(last.at)}|${last.seq}` : null;
  const role: AuditRole = query.role === 'auditor' ? 'auditor' : 'viewer';
  return { events: pageEvents.map(event => view(event, role)), nextCursor, watermark, total: matched.length, facets };
}
