export type ProjectStatus = 'development' | 'production' | 'post' | 'delivered';
export type AssetType = 'master' | 'trailer' | 'poster' | 'audio' | 'subtitle';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AuditResult = 'success' | 'failure';
export type AuditRole = 'auditor' | 'viewer';

export interface Project { id: string; code: string; title: string; season: number; status: ProjectStatus; currency: string; budgetVersionId: string; deliveryDate: string; }
export interface BudgetLine { id: string; projectId: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; owner: string; risk: 'low' | 'medium' | 'high'; }
export interface Contract { id: string; projectId: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; milestones: { name: string; due: string; amount: number; status: 'open' | 'invoiced' | 'paid' }[]; }
export interface Asset { id: string; projectId: string; name: string; type: AssetType; version: number; status: 'draft' | 'review' | 'approved' | 'locked'; owner: string; checksum: string; territories: string[]; platforms: string[]; availableFrom: string; availableTo: string; rightsTags: string[]; }
export interface Approval { id: string; projectId: string; entityType: 'budget' | 'asset' | 'delivery'; entityId: string; title: string; requestedBy: string; status: ApprovalStatus; approver: string; createdAt: string; comment?: string; }

// 审计事件（schemaVersion 2）：带项目归属、因果序号 seq、前后值、关联 ID 与成败结果
export interface AuditEvent {
  id: string; projectId: string; seq: number; action: string; entity: string; entityId: string; actor: string; at: string;
  result: AuditResult; before: Record<string, unknown>; after: Record<string, unknown>; relatedIds: string[]; details: string; schemaVersion: number;
}
// 旧版事件（schemaVersion 1）只有扁平字段且可能缺字段，入库时统一归一化，保证历史可读
export interface LegacyAuditEvent {
  id: string; action: string; entity: string; entityId: string; actor?: string; at?: string; details?: string;
  projectId?: string; result?: AuditResult; before?: Record<string, unknown>; after?: Record<string, unknown>; relatedIds?: string[];
}

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);

export const projects: Project[] = [
  { id: 'PRJ-001', code: 'NORTHSTAR-S1', title: 'Northstar / 北境回声', season: 1, status: 'post', currency: 'CNY', budgetVersionId: 'BUD-001-V3', deliveryDate: iso(44) },
  { id: 'PRJ-002', code: 'ORBIT-DOC', title: 'Orbit / 轨道之外', season: 1, status: 'production', currency: 'CNY', budgetVersionId: 'BUD-002-V2', deliveryDate: iso(126) }
];
export const budgetLines: BudgetLine[] = [
  { id: 'BL-101', projectId: 'PRJ-001', category: '制作', subcategory: '主演与主创', planned: 12800000, committed: 11200000, actual: 10400000, forecast: 13100000, owner: '制片部', risk: 'medium' },
  { id: 'BL-102', projectId: 'PRJ-001', category: '制作', subcategory: '摄影器材与场地', planned: 6800000, committed: 6400000, actual: 5980000, forecast: 7020000, owner: '现场制片', risk: 'low' },
  { id: 'BL-103', projectId: 'PRJ-001', category: '后期', subcategory: '调色、DIT、母版', planned: 5400000, committed: 4300000, actual: 2800000, forecast: 5750000, owner: '后期制片', risk: 'high' },
  { id: 'BL-104', projectId: 'PRJ-001', category: '宣发', subcategory: '预告片与物料', planned: 3600000, committed: 1900000, actual: 1240000, forecast: 3200000, owner: '营销部', risk: 'medium' },
  { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 5100000, actual: 3300000, forecast: 9000000, owner: '制片部', risk: 'medium' }
];
export const contracts: Contract[] = [
  { id: 'CTR-01', projectId: 'PRJ-001', vendor: '曜石后期制作', scope: '4K HDR 调色、声音、DCP 母版', ceiling: 5200000, committed: 4300000, paid: 2300000, milestones: [{ name: '锁剪交付', due: iso(8), amount: 1200000, status: 'invoiced' }, { name: '母版验收', due: iso(36), amount: 2000000, status: 'open' }] },
  { id: 'CTR-02', projectId: 'PRJ-001', vendor: '远景国际版权', scope: '北美与欧洲音乐同步许可', ceiling: 880000, committed: 880000, paid: 440000, milestones: [{ name: '签署', due: iso(-16), amount: 440000, status: 'paid' }, { name: '交付版权证明', due: iso(4), amount: 440000, status: 'invoiced' }] },
  { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1600000, committed: 1100000, paid: 600000, milestones: [{ name: '素材包一', due: iso(20), amount: 500000, status: 'open' }] }
];
export const assets: Asset[] = [
  { id: 'AST-001', projectId: 'PRJ-001', name: '北境回声 S01E01 4K HDR Master', type: 'master', version: 7, status: 'review', owner: '后期制片', checksum: 'sha256:91b7…e2a1', territories: ['CN', 'HK', 'SG'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-2), availableTo: iso(730), rightsTags: ['音乐-同步许可', '演员-全媒介'] },
  { id: 'AST-002', projectId: 'PRJ-001', name: '主预告 90s / Cut A', type: 'trailer', version: 4, status: 'approved', owner: '营销部', checksum: 'sha256:42ca…9b02', territories: ['CN'], platforms: ['StreamBox', '短视频'], availableFrom: iso(6), availableTo: iso(180), rightsTags: ['演员-宣传许可'] },
  { id: 'AST-003', projectId: 'PRJ-001', name: '片尾曲 / Winter Signal', type: 'audio', version: 2, status: 'locked', owner: '音乐版权', checksum: 'sha256:113c…78f0', territories: ['CN', 'US', 'CA'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-40), availableTo: iso(52), rightsTags: ['音乐-同步许可'] },
  { id: 'AST-004', projectId: 'PRJ-002', name: 'Orbit E02 Satellite Plates', type: 'master', version: 3, status: 'review', owner: '视觉总监', checksum: 'sha256:8a10…4a9d', territories: ['全球'], platforms: ['影院'], availableFrom: iso(18), availableTo: iso(365), rightsTags: ['航拍-编辑许可'] }
];
export const approvals: Approval[] = [
  { id: 'APR-01', projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '后期超支预案 V3', requestedBy: '制片主任', status: 'pending', approver: '财务负责人', createdAt: iso(-1) },
  { id: 'APR-02', projectId: 'PRJ-001', entityType: 'asset', entityId: 'AST-001', title: 'E01 最终母版锁定', requestedBy: '后期制片', status: 'pending', approver: '总制片人', createdAt: iso(-2) },
  { id: 'APR-03', projectId: 'PRJ-002', entityType: 'delivery', entityId: 'DEL-007', title: '海外节展交付包', requestedBy: '发行部', status: 'approved', approver: '法务负责人', createdAt: iso(-5), comment: '已补充航拍授权凭证' }
];

// 历史事件种子：保持旧格式入库，验证缺字段的旧事件归一化后依然可读（如 AUD-02 缺 details）
const legacyAuditEvents: LegacyAuditEvent[] = [
  { id: 'AUD-01', action: 'CREATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at: new Date(now - 86400000).toISOString(), details: '从 V2 复制并调整后期科目' },
  { id: 'AUD-02', action: 'LOCK', entity: 'asset', entityId: 'AST-003', actor: '音乐版权', at: new Date(now - 2 * 86400000).toISOString() },
  { id: 'AUD-03', action: 'APPROVED', entity: 'delivery', entityId: 'DEL-007', actor: '法务负责人', at: new Date(now - 5 * 86400000).toISOString(), details: '海外节展交付包审批通过' }
];

// ---------------------------------------------------------------------------
// 审计事件引擎
// ---------------------------------------------------------------------------

let auditSeq = 0;
export const auditEvents: AuditEvent[] = [];

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// 旧事件没有 projectId，按实体注册表回填归属；无法归属的标记 UNSCOPED，不会混入任何项目查询
function inferProjectId(entityId: string): string {
  if (projects.some(project => project.id === entityId)) return entityId;
  const versionOwner = projects.find(project => project.budgetVersionId === entityId);
  if (versionOwner) return versionOwner.id;
  const owned = [...budgetLines, ...contracts, ...assets, ...approvals].find(item => item.id === entityId);
  if (owned) return owned.projectId;
  const byApprovalEntity = approvals.find(approval => approval.entityId === entityId);
  if (byApprovalEntity) return byApprovalEntity.projectId;
  return 'UNSCOPED';
}

function normalizeLegacyEvent(raw: LegacyAuditEvent): AuditEvent {
  auditSeq += 1;
  return {
    id: raw.id,
    projectId: raw.projectId ?? inferProjectId(raw.entityId),
    seq: auditSeq,
    action: raw.action,
    entity: raw.entity,
    entityId: raw.entityId,
    actor: raw.actor?.trim() ? raw.actor : '未知操作者',
    at: raw.at ?? '',
    result: raw.result === 'failure' ? 'failure' : 'success',
    before: isPlainObject(raw.before) ? raw.before : {},
    after: isPlainObject(raw.after) ? raw.after : {},
    relatedIds: Array.isArray(raw.relatedIds) ? raw.relatedIds.filter(id => typeof id === 'string' && id) : [],
    details: raw.details ?? '',
    schemaVersion: 1
  };
}
legacyAuditEvents.forEach(raw => auditEvents.push(normalizeLegacyEvent(raw)));

export type AuditEventInput = {
  id?: string; projectId: string; action: string; entity: string; entityId: string; actor: string; at?: string;
  result?: AuditResult; before?: Record<string, unknown>; after?: Record<string, unknown>; relatedIds?: string[]; details?: string;
};

// 追加审计事件：先完整校验再一次性入列，缺字段/非法字段不会留下半写入事件；
// 显式 id 已存在时视为重复重放，直接返回原事件，不再追加
export function recordAuditEvent(input: AuditEventInput): { ok: true; event: AuditEvent; deduplicated: boolean } | { ok: false; error: string } {
  if (input.id) {
    const existing = auditEvents.find(event => event.id === input.id);
    if (existing) return { ok: true, event: existing, deduplicated: true };
  }
  if (!input.projectId || !input.action || !input.entity || !input.entityId || !input.actor?.trim()) return { ok: false, error: '审计事件缺少必填字段（projectId/action/entity/entityId/actor）' };
  if (input.before !== undefined && !isPlainObject(input.before)) return { ok: false, error: 'before 必须是对象' };
  if (input.after !== undefined && !isPlainObject(input.after)) return { ok: false, error: 'after 必须是对象' };
  if (input.relatedIds !== undefined && (!Array.isArray(input.relatedIds) || input.relatedIds.some(id => typeof id !== 'string' || !id))) return { ok: false, error: 'relatedIds 必须是非空字符串数组' };
  if (input.result !== undefined && input.result !== 'success' && input.result !== 'failure') return { ok: false, error: 'result 只能是 success 或 failure' };
  if (input.at !== undefined && Number.isNaN(Date.parse(input.at))) return { ok: false, error: 'at 时间格式非法' };
  auditSeq += 1;
  const event: AuditEvent = {
    id: input.id ?? `AUD-${String(auditSeq).padStart(4, '0')}`,
    projectId: input.projectId,
    seq: auditSeq,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    actor: input.actor.trim(),
    at: input.at ?? new Date().toISOString(),
    result: input.result ?? 'success',
    before: input.before ?? {},
    after: input.after ?? {},
    relatedIds: input.relatedIds ?? [],
    details: input.details ?? '',
    schemaVersion: 2
  };
  auditEvents.push(event);
  return { ok: true, event, deduplicated: false };
}

// 敏感字段：非审计员角色查询时，前后值中的这些字段一律脱敏
export const SENSITIVE_AUDIT_FIELDS = ['checksum', 'comment', 'paid'];

function maskRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, SENSITIVE_AUDIT_FIELDS.includes(key) ? '***' : maskValue(value)]));
}
function maskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskValue);
  if (isPlainObject(value)) return maskRecord(value);
  return value;
}
function presentEvent(event: AuditEvent, role: AuditRole): AuditEvent {
  if (role === 'auditor') return { ...event };
  return { ...event, before: maskRecord(event.before), after: maskRecord(event.after) };
}

export interface AuditQuery {
  projectId: string; entity?: string; entityId?: string; actor?: string; action?: string; result?: string;
  from?: string; to?: string; beforeSeq?: number; limit?: number; role?: AuditRole;
}
export interface AuditPage { events: AuditEvent[]; total: number; nextCursor: number | null; masked: boolean; }

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// 项目审计探索器查询：强制项目隔离；时间边界含 from/to（纯日期的 to 延展到当日结束）；
// 查询开始时对项目事件做快照，配合 beforeSeq 游标，筛选期间新写入的事件不会打乱翻页
export function queryAuditEvents(query: AuditQuery): AuditPage | { error: string } {
  if (!query.projectId) return { error: '必须指定项目范围，禁止跨项目查询' };
  let fromMs: number | undefined;
  let toMs: number | undefined;
  if (query.from) { fromMs = Date.parse(query.from); if (Number.isNaN(fromMs)) return { error: 'from 时间格式非法' }; }
  if (query.to) { toMs = Date.parse(DAY_ONLY.test(query.to) ? `${query.to}T23:59:59.999Z` : query.to); if (Number.isNaN(toMs)) return { error: 'to 时间格式非法' }; }
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) return { error: 'from 不能晚于 to' };
  if (query.result !== undefined && query.result !== '' && query.result !== 'success' && query.result !== 'failure') return { error: 'result 只能是 success 或 failure' };
  if (query.beforeSeq !== undefined && (!Number.isFinite(query.beforeSeq) || query.beforeSeq < 0)) return { error: 'beforeSeq 游标非法' };
  const limit = Math.min(Math.max(Math.floor(query.limit ?? 50) || 50, 1), 200);
  const role: AuditRole = query.role === 'auditor' ? 'auditor' : 'viewer';
  const snapshot = auditEvents.filter(event => event.projectId === query.projectId);
  const filtered = snapshot.filter(event => {
    if (query.entity && event.entity !== query.entity) return false;
    if (query.entityId && event.entityId !== query.entityId) return false;
    if (query.actor && !event.actor.includes(query.actor)) return false;
    if (query.action && event.action.toUpperCase() !== query.action.toUpperCase()) return false;
    if (query.result && event.result !== query.result) return false;
    if (fromMs !== undefined || toMs !== undefined) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at)) return false; // 缺时间字段的旧事件不参与时间过滤，无时间条件时仍可读
      if (fromMs !== undefined && at < fromMs) return false; // 时间边界：含 from
      if (toMs !== undefined && at > toMs) return false; // 时间边界：含 to
    }
    return true;
  });
  // 因果顺序：seq 单调递增即写入顺序，探索器默认倒序展示
  const ordered = filtered.sort((a, b) => b.seq - a.seq);
  const paged = query.beforeSeq !== undefined ? ordered.filter(event => event.seq < (query.beforeSeq as number)) : ordered;
  const events = paged.slice(0, limit).map(event => presentEvent(event, role));
  const nextCursor = paged.length > limit ? events[events.length - 1].seq : null;
  return { events, total: filtered.length, nextCursor, masked: role !== 'auditor' };
}

// 单条事件的因果链：仅在同项目内沿 entityId / relatedIds 递推展开，按 seq 升序，跨项目不展开
export function auditChain(projectId: string, eventId: string, role: AuditRole = 'viewer'): AuditEvent[] | undefined {
  const anchor = auditEvents.find(event => event.id === eventId);
  if (!anchor || anchor.projectId !== projectId) return undefined;
  const scope = auditEvents.filter(event => event.projectId === projectId);
  const included = new Map<string, AuditEvent>();
  const ids = new Set<string>([anchor.entityId, ...anchor.relatedIds]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of scope) {
      if (included.has(event.id)) continue;
      if (event.id === anchor.id || ids.has(event.entityId) || event.relatedIds.some(id => ids.has(id))) {
        included.set(event.id, event);
        ids.add(event.entityId);
        event.relatedIds.forEach(id => ids.add(id));
        changed = true;
      }
    }
  }
  return [...included.values()].sort((a, b) => a.seq - b.seq).slice(0, 200).map(event => presentEvent(event, role));
}

// ---------------------------------------------------------------------------
// 领域查询与操作
// ---------------------------------------------------------------------------

export function projectSummary(projectId = projects[0].id) {
  const lines = budgetLines.filter(line => line.projectId === projectId);
  const projectContracts = contracts.filter(contract => contract.projectId === projectId);
  const projectAssets = assets.filter(asset => asset.projectId === projectId);
  const projectApprovals = approvals.filter(approval => approval.projectId === projectId);
  const planned = lines.reduce((sum, line) => sum + line.planned, 0);
  const forecast = lines.reduce((sum, line) => sum + line.forecast, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual, 0);
  return { project: projects.find(project => project.id === projectId), planned, forecast, actual, variance: forecast - planned, utilization: planned ? actual / planned : 0, committed: lines.reduce((sum, line) => sum + line.committed, 0), contractExposure: projectContracts.reduce((sum, contract) => sum + contract.ceiling, 0), assetCount: projectAssets.length, pendingApprovals: projectApprovals.filter(item => item.status === 'pending').length, highRiskLines: lines.filter(line => line.risk === 'high'), lines, contracts: projectContracts, assets: projectAssets, approvals: projectApprovals };
}

export function rightsConflicts(projectId = projects[0].id) {
  const list = assets.filter(asset => asset.projectId === projectId);
  const conflicts: { severity: 'critical' | 'warning'; assetA: string; assetB: string; reason: string }[] = [];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const a = list[i], b = list[j];
    const sameTag = a.rightsTags.some(tag => b.rightsTags.includes(tag));
    const sameTerritory = a.territories.includes('全球') || b.territories.includes('全球') || a.territories.some(territory => b.territories.includes(territory));
    if (sameTag && sameTerritory && a.availableTo >= b.availableFrom && b.availableTo >= a.availableFrom) conflicts.push({ severity: a.status === 'locked' || b.status === 'locked' ? 'critical' : 'warning', assetA: a.name, assetB: b.name, reason: `同一授权标签在重叠窗口内覆盖相同地域：${a.rightsTags.filter(tag => b.rightsTags.includes(tag)).join('、')}` });
  }
  return conflicts;
}

const VALID_APPROVAL_TRANSITION: ApprovalStatus[] = ['approved', 'rejected'];

export function approve(id: string, status: ApprovalStatus, comment = '', actor = '当前审批人', eventId?: string) {
  const item = approvals.find(approval => approval.id === id);
  if (!item) return undefined;
  if (eventId) { // 重复重放：同一请求已记录过，直接返回现状，不产生第二条事件
    const replay = auditEvents.find(event => event.id === eventId);
    if (replay) return item;
  }
  if (!VALID_APPROVAL_TRANSITION.includes(status)) {
    recordAuditEvent({ id: eventId, projectId: item.projectId, action: String(status).toUpperCase(), entity: item.entityType, entityId: item.entityId, actor, result: 'failure', before: { status: item.status }, after: { status: item.status }, relatedIds: [item.id, item.entityId], details: `审批 ${item.id} 收到非法目标状态 ${status}，已拒绝` });
    return undefined;
  }
  if (item.status !== 'pending') {
    recordAuditEvent({ id: eventId, projectId: item.projectId, action: status.toUpperCase(), entity: item.entityType, entityId: item.entityId, actor, result: 'failure', before: { status: item.status }, after: { status: item.status }, relatedIds: [item.id, item.entityId], details: `审批 ${item.id} 已处于 ${item.status}，状态迁移被拒绝` });
    return undefined;
  }
  const before = { status: item.status as ApprovalStatus, comment: item.comment ?? '' };
  item.status = status; item.comment = comment;
  recordAuditEvent({ id: eventId, projectId: item.projectId, action: status.toUpperCase(), entity: item.entityType, entityId: item.entityId, actor, before, after: { status, comment }, relatedIds: [item.id, item.entityId], details: comment || `${item.title} 已${status === 'approved' ? '通过' : '驳回'}` });
  return item;
}

export function createApproval(input: Pick<Approval, 'projectId' | 'entityType' | 'entityId' | 'title' | 'requestedBy' | 'approver'>, eventId?: string) {
  if (eventId) {
    const replay = auditEvents.find(event => event.id === eventId);
    if (replay) return approvals.find(approval => approval.id === replay.relatedIds[0]);
  }
  const item: Approval = { projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, title: input.title, requestedBy: input.requestedBy, approver: input.approver, id: `APR-${Date.now()}-${approvals.length}`, status: 'pending', createdAt: new Date().toISOString() };
  approvals.unshift(item);
  recordAuditEvent({ id: eventId, projectId: item.projectId, action: 'CREATE', entity: 'approval', entityId: item.id, actor: input.requestedBy, after: { title: item.title, status: item.status, entityType: item.entityType, entityId: item.entityId }, relatedIds: [item.id, input.entityId], details: `发起审批：${item.title}` });
  return item;
}

const BUDGET_NUMERIC_FIELDS = ['planned', 'committed', 'actual', 'forecast'] as const;
const BUDGET_TEXT_FIELDS = ['owner', 'category', 'subcategory'] as const;

// 预算行调整：逐字段校验并记录前后值；未知字段/非法值/跨项目访问整体拒绝并记录失败事件，不产生半写入
export function updateBudgetLine(projectId: string, lineId: string, patch: Record<string, unknown>, actor: string, eventId?: string): { ok: true; line: BudgetLine } | { ok: false; error: string } {
  const fail = (error: string): { ok: false; error: string } => {
    recordAuditEvent({ id: eventId, projectId, action: 'UPDATE', entity: 'budgetLine', entityId: lineId, actor, result: 'failure', details: error });
    return { ok: false, error };
  };
  const line = budgetLines.find(item => item.id === lineId && item.projectId === projectId);
  if (!line) return fail('预算行不存在或不属于该项目，修改被拒绝');
  if (eventId) {
    const replay = auditEvents.find(event => event.id === eventId);
    if (replay && replay.result === 'success') return { ok: true, line };
  }
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((BUDGET_NUMERIC_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fail(`字段 ${key} 必须是非负数字，修改被拒绝`);
      if (line[key as (typeof BUDGET_NUMERIC_FIELDS)[number]] !== value) { before[key] = line[key as (typeof BUDGET_NUMERIC_FIELDS)[number]]; after[key] = value; }
    } else if ((BUDGET_TEXT_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'string' || !value.trim()) return fail(`字段 ${key} 必须是非空文本，修改被拒绝`);
      if (line[key as (typeof BUDGET_TEXT_FIELDS)[number]] !== value) { before[key] = line[key as (typeof BUDGET_TEXT_FIELDS)[number]]; after[key] = value; }
    } else if (key === 'risk') {
      if (value !== 'low' && value !== 'medium' && value !== 'high') return fail('字段 risk 只能是 low/medium/high，修改被拒绝');
      if (line.risk !== value) { before.risk = line.risk; after.risk = value; }
    } else {
      return fail(`包含不支持的字段 ${key}，修改被整体拒绝`);
    }
  }
  if (Object.keys(after).length === 0) return { ok: true, line }; // 无实际变化：不产生噪音事件
  Object.assign(line, after);
  const project = projects.find(item => item.id === projectId);
  recordAuditEvent({ id: eventId, projectId, action: 'UPDATE', entity: 'budgetLine', entityId: lineId, actor, before, after, relatedIds: project ? [project.budgetVersionId] : [], details: `预算行「${line.subcategory}」调整：${Object.keys(after).join('、')}` });
  return { ok: true, line };
}

// 资产版本锁定：把当时的版权冲突快照写进事件（关联冲突资产 ID）；存在严重冲突时拒绝并记录失败事件
export function lockAssetVersion(projectId: string, assetId: string, actor: string, eventId?: string): { ok: true; asset: Asset } | { ok: false; error: string } {
  const fail = (error: string, relatedIds: string[] = []): { ok: false; error: string } => {
    recordAuditEvent({ id: eventId, projectId, action: 'LOCK', entity: 'asset', entityId: assetId, actor, result: 'failure', relatedIds, details: error });
    return { ok: false, error };
  };
  const asset = assets.find(item => item.id === assetId && item.projectId === projectId);
  if (!asset) return fail('资产不存在或不属于该项目，锁定被拒绝');
  if (eventId) {
    const replay = auditEvents.find(event => event.id === eventId);
    if (replay && replay.result === 'success') return { ok: true, asset };
  }
  if (asset.status === 'locked') return fail('资产已锁定，重复锁定被拒绝');
  const conflicts = rightsConflicts(projectId).filter(conflict => conflict.assetA === asset.name || conflict.assetB === asset.name);
  const relatedIds = [...new Set(conflicts.map(conflict => {
    const otherName = conflict.assetA === asset.name ? conflict.assetB : conflict.assetA;
    return assets.find(item => item.projectId === projectId && item.name === otherName)?.id;
  }).filter((id): id is string => Boolean(id)))];
  const critical = conflicts.find(conflict => conflict.severity === 'critical');
  if (critical) return fail(`存在严重版权冲突，锁定被拒绝：${critical.reason}`, relatedIds);
  const before = { status: asset.status, version: asset.version };
  asset.status = 'locked';
  recordAuditEvent({ id: eventId, projectId, action: 'LOCK', entity: 'asset', entityId: assetId, actor, before, after: { status: 'locked', version: asset.version, conflictsAtLock: conflicts.length }, relatedIds, details: conflicts.length ? `锁定完成，当时存在 ${conflicts.length} 条警告级版权冲突` : '锁定完成，当时无版权冲突' });
  return { ok: true, asset };
}

export function dashboard() { return projects.map(project => projectSummary(project.id)).map(summary => ({ id: summary.project?.id, title: summary.project?.title, status: summary.project?.status, forecast: summary.forecast, variance: summary.variance, pendingApprovals: summary.pendingApprovals, rightsConflicts: rightsConflicts(summary.project?.id).length })); }
