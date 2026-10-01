import { appendAuditEvent, registerProjectResolver, type AuditEventInput } from './audit.js';

export type ProjectStatus = 'development' | 'production' | 'post' | 'delivered';
export type AssetType = 'master' | 'trailer' | 'poster' | 'audio' | 'subtitle';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Project { id: string; code: string; title: string; season: number; status: ProjectStatus; currency: string; budgetVersionId: string; deliveryDate: string; }
export interface BudgetLine { id: string; projectId: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; owner: string; risk: 'low' | 'medium' | 'high'; }
export interface Contract { id: string; projectId: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; milestones: { name: string; due: string; amount: number; status: 'open' | 'invoiced' | 'paid' }[]; }
export interface Asset { id: string; projectId: string; name: string; type: AssetType; version: number; status: 'draft' | 'review' | 'approved' | 'locked'; owner: string; checksum: string; territories: string[]; platforms: string[]; availableFrom: string; availableTo: string; rightsTags: string[]; }
export interface Approval { id: string; projectId: string; entityType: 'budget' | 'asset' | 'delivery'; entityId: string; title: string; requestedBy: string; status: ApprovalStatus; approver: string; createdAt: string; comment?: string; }
// 旧版审计事件：只有扁平字段，没有前后值、关联 ID 与结果。保留原样作为遗产数据，
// 启动时由审计存储规范化后纳入统一查询。
export interface LegacyAuditEvent { id: string; action: string; entity: string; entityId: string; actor: string; at: string; details: string; }

export class DomainError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'DomainError'; }
}

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);
const at = (daysAgo: number, hour = 10) => new Date(now - daysAgo * 86400000 + hour * 3600000).toISOString();

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
  { id: 'AST-003', projectId: 'PRJ-001', name: '片尾曲 / Winter Signal', type: 'audio', version: 2, status: 'review', owner: '音乐版权', checksum: 'sha256:113c…78f0', territories: ['CN', 'US', 'CA'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-40), availableTo: iso(52), rightsTags: ['音乐-同步许可'] },
  { id: 'AST-004', projectId: 'PRJ-002', name: 'Orbit E02 Satellite Plates', type: 'master', version: 3, status: 'review', owner: '视觉总监', checksum: 'sha256:8a10…4a9d', territories: ['全球'], platforms: ['影院'], availableFrom: iso(18), availableTo: iso(365), rightsTags: ['航拍-编辑许可'] }
];
export const approvals: Approval[] = [
  { id: 'APR-01', projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '后期超支预案 V3', requestedBy: '制片主任', status: 'pending', approver: '财务负责人', createdAt: iso(-1) },
  { id: 'APR-02', projectId: 'PRJ-001', entityType: 'asset', entityId: 'AST-001', title: 'E01 最终母版锁定', requestedBy: '后期制片', status: 'pending', approver: '总制片人', createdAt: iso(-2) },
  { id: 'APR-03', projectId: 'PRJ-002', entityType: 'delivery', entityId: 'DEL-007', title: '海外节展交付包', requestedBy: '发行部', status: 'pending', approver: '法务负责人', createdAt: iso(-5) }
];
export const auditEvents: LegacyAuditEvent[] = [{ id: 'AUD-01', action: 'CREATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at: new Date(now - 86400000).toISOString(), details: '从 V2 复制并调整后期科目' }];

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

// 实体 → 项目归属解析：审计查询的项目隔离与跨项目防泄露都建立在这份解析上
registerProjectResolver((entity, entityId) => {
  if (entity === 'project') return projects.some(project => project.id === entityId) ? entityId : null;
  if (entity === 'budget') {
    const byVersion = projects.find(project => project.budgetVersionId === entityId);
    if (byVersion) return byVersion.id;
    return budgetLines.find(line => line.id === entityId)?.projectId ?? null;
  }
  if (entity === 'asset') return assets.find(asset => asset.id === entityId)?.projectId ?? null;
  if (entity === 'approval') return approvals.find(approval => approval.id === entityId)?.projectId ?? null;
  if (entity === 'contract') return contracts.find(contract => contract.id === entityId)?.projectId ?? null;
  return null;
});

export function approve(id: string, status: ApprovalStatus, comment = '', actor?: string, at?: string) {
  const item = approvals.find(approval => approval.id === id);
  if (!item) return undefined;
  const who = actor ?? item.approver;
  const fail = (details: string, error: DomainError): never => {
    appendAuditEvent({ action: String(status).toUpperCase(), entity: item.entityType, entityId: item.entityId, actor: who, at, projectId: item.projectId, result: 'failure', before: { status: item.status }, relatedIds: [item.id, item.entityId], details });
    throw error;
  };
  if (status !== 'approved' && status !== 'rejected') fail(`非法审批状态：${String(status)}`, new DomainError('非法审批状态', 400));
  if (item.status !== 'pending') fail(`审批已终结（${item.status}），重复操作被拒绝`, new DomainError('审批已终结，不可重复操作', 409));
  const before = { status: item.status as ApprovalStatus };
  item.status = status;
  item.comment = comment;
  appendAuditEvent({
    action: status.toUpperCase(), entity: item.entityType, entityId: item.entityId, actor: who, at, projectId: item.projectId,
    before, after: { status }, relatedIds: [item.id, item.entityId],
    details: comment || `${item.title} 已${status === 'approved' ? '通过' : '驳回'}`,
    context: item.entityType === 'asset' ? { conflicts: rightsConflicts(item.projectId) } : undefined
  });
  return item;
}

export function createApproval(input: Pick<Approval, 'projectId' | 'entityType' | 'entityId' | 'title' | 'requestedBy' | 'approver'>) {
  const item: Approval = { ...input, id: `APR-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString() };
  approvals.unshift(item);
  appendAuditEvent({ action: 'CREATE', entity: 'approval', entityId: item.id, actor: input.requestedBy, projectId: input.projectId, after: { status: 'pending' }, relatedIds: [item.id, input.entityId], details: `发起审批：${input.title}` });
  return item;
}

export function adjustBudgetLine(projectId: string, lineId: string, patch: { planned?: number; forecast?: number }, actor: string, reason = '') {
  const line = budgetLines.find(item => item.id === lineId && item.projectId === projectId);
  if (!line) return undefined;
  const project = projects.find(item => item.id === projectId);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of ['planned', 'forecast'] as const) if (patch[key] !== undefined) { before[key] = line[key]; after[key] = patch[key]; }
  const fail = (details: string): never => {
    appendAuditEvent({ action: 'UPDATE', entity: 'budget', entityId: lineId, actor, projectId, result: 'failure', before, after, relatedIds: [project?.budgetVersionId ?? projectId, lineId], sensitiveFields: ['planned', 'forecast'], details });
    throw new DomainError(details, 422);
  };
  if (Object.keys(after).length === 0) fail('没有需要调整的字段');
  if (Object.values(after).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail('金额必须为非负数字');
  if ((patch.planned ?? line.planned) < line.committed) fail(`计划金额低于已承诺额 ¥${line.committed}，校验拒绝`);
  if (patch.planned !== undefined) line.planned = patch.planned;
  if (patch.forecast !== undefined) line.forecast = patch.forecast;
  appendAuditEvent({ action: 'UPDATE', entity: 'budget', entityId: lineId, actor, projectId, before, after, relatedIds: [project?.budgetVersionId ?? projectId, lineId], sensitiveFields: ['planned', 'forecast'], details: reason || `预算科目调整：${line.subcategory}` });
  return line;
}

export function lockAsset(id: string, actor: string, at?: string) {
  const asset = assets.find(item => item.id === id);
  if (!asset) return undefined;
  if (asset.status === 'locked') {
    appendAuditEvent({ action: 'LOCK', entity: 'asset', entityId: id, actor, at, projectId: asset.projectId, result: 'failure', before: { status: asset.status }, after: { status: 'locked' }, relatedIds: [id], details: '资产已锁定，重复锁定被拒绝' });
    throw new DomainError('资产已锁定', 409);
  }
  // 锁定前快照当时的版权冲突，作为本次锁定的依据留痕
  const conflicts = rightsConflicts(asset.projectId);
  const before = { status: asset.status, version: asset.version };
  asset.status = 'locked';
  const linkedApprovals = approvals.filter(approval => approval.entityType === 'asset' && approval.entityId === id).map(approval => approval.id);
  appendAuditEvent({ action: 'LOCK', entity: 'asset', entityId: id, actor, at, projectId: asset.projectId, before, after: { status: 'locked', version: asset.version }, relatedIds: [id, ...linkedApprovals], context: { conflicts }, details: `${asset.name} v${asset.version} 锁定` });
  return asset;
}

export function dashboard() { return projects.map(project => projectSummary(project.id)).map(summary => ({ id: summary.project?.id, title: summary.project?.title, status: summary.project?.status, forecast: summary.forecast, variance: summary.variance, pendingApprovals: summary.pendingApprovals, rightsConflicts: rightsConflicts(summary.project?.id).length })); }

// 历史事件种子：覆盖旧格式、前后值、失败结果、半写入、缺字段与重复重放，
// 让审计探索器在演示数据下即可验证完整性与因果顺序。
function seedAuditEvents() {
  for (const raw of auditEvents) appendAuditEvent({ ...raw, legacy: true });
  const budgetAdjustment: AuditEventInput = {
    id: 'AUD-102', action: 'UPDATE', entity: 'budget', entityId: 'BL-103', actor: '后期制片', at: at(1, 15),
    before: { forecast: 5400000 }, after: { forecast: 5750000 },
    relatedIds: ['BUD-001-V3', 'BL-103'], sensitiveFields: ['forecast'],
    details: '调色档期追加，后期预测上调'
  };
  appendAuditEvent(budgetAdjustment);
  appendAuditEvent(budgetAdjustment); // 重复重放：同 id 二次写入应被去重
  appendAuditEvent({
    id: 'AUD-103', action: 'UPDATE', entity: 'budget', entityId: 'BL-104', actor: '营销部', at: at(1, 16), result: 'failure',
    before: { planned: 3600000 }, after: { planned: 1500000 },
    relatedIds: ['BUD-001-V3', 'BL-104'], sensitiveFields: ['planned'],
    details: '计划金额低于已承诺额 ¥1900000，校验拒绝'
  });
  // 半写入：版本回写中断，缺时间戳与前后值
  appendAuditEvent({ id: 'AUD-104', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '后期制片', details: '母版版本回写中断，前后值缺失' });
  // 缺字段：来源系统未回传操作者
  appendAuditEvent({ id: 'AUD-105', action: 'UPLOAD', entity: 'asset', entityId: 'AST-004', at: at(3, 9), details: '卫星素材校验和登记（来源系统未回传操作者）' });
  lockAsset('AST-003', '音乐版权', at(2, 11));
  approve('APR-03', 'approved', '已补充航拍授权凭证', undefined, at(4, 10));
}
seedAuditEvents();
