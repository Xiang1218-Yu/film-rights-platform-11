import express from 'express';
import { approve, assets, auditChain, budgetLines, contracts, createApproval, dashboard, lockAssetVersion, projectSummary, projects, queryAuditEvents, rightsConflicts, updateBudgetLine } from './domain.js';
const app = express(); app.use(express.json());
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/projects', (_req, res) => res.json(projects));
app.get('/api/projects/:id/summary', (req, res) => { const result = projectSummary(req.params.id); if (!result.project) return res.status(404).json({ message: '项目不存在' }); res.json(result); });
app.get('/api/projects/:id/rights-conflicts', (req, res) => res.json(rightsConflicts(req.params.id)));
app.get('/api/projects/:id/assets', (req, res) => res.json(assets.filter(asset => asset.projectId === req.params.id)));
app.get('/api/projects/:id/contracts', (req, res) => res.json(contracts.filter(contract => contract.projectId === req.params.id)));
app.get('/api/budgets/:projectId/lines', (req, res) => res.json(budgetLines.filter(line => line.projectId === req.params.projectId)));

// 项目审计探索器：强制项目隔离，支持实体/操作者/动作/结果/时间筛选与 beforeSeq 游标翻页
app.get('/api/projects/:id/audit', (req, res) => {
  if (!projects.some(project => project.id === req.params.id)) return res.status(404).json({ message: '项目不存在' });
  if (req.query.projectId && req.query.projectId !== req.params.id) return res.status(403).json({ message: '禁止跨项目查询审计事件' });
  const result = queryAuditEvents({
    projectId: req.params.id,
    entity: req.query.entity as string | undefined,
    entityId: req.query.entityId as string | undefined,
    actor: req.query.actor as string | undefined,
    action: req.query.action as string | undefined,
    result: req.query.result as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    beforeSeq: req.query.beforeSeq !== undefined ? Number(req.query.beforeSeq) : undefined,
    limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    role: req.query.role === 'auditor' ? 'auditor' : 'viewer'
  });
  if ('error' in result) return res.status(400).json({ message: result.error });
  res.json(result);
});
// 单条事件的因果链：仅在同项目内沿关联 ID 展开，按因果序号升序
app.get('/api/projects/:id/audit/:eventId/chain', (req, res) => {
  const chain = auditChain(req.params.id, req.params.eventId, req.query.role === 'auditor' ? 'auditor' : 'viewer');
  if (!chain) return res.status(404).json({ message: '事件不存在或不属于该项目' });
  res.json({ events: chain });
});

app.post('/api/approvals', (req, res) => {
  const { projectId, entityType, entityId, title, requestedBy, approver, requestId } = req.body ?? {};
  if (!projectId || !entityType || !entityId || !title || !requestedBy || !approver) return res.status(400).json({ message: '审批缺少必填字段' });
  res.status(201).json(createApproval({ projectId, entityType, entityId, title, requestedBy, approver }, requestId));
});
app.patch('/api/approvals/:id', (req, res) => { const result = approve(req.params.id, req.body.status, req.body.comment, req.body.actor, req.body.requestId); if (!result) return res.status(409).json({ message: '审批不存在或状态不允许变更，已记录失败审计事件' }); res.json(result); });

// 预算行调整：逐字段记录前后值，非法字段/跨项目访问整体拒绝并记录失败事件
app.patch('/api/projects/:id/budget-lines/:lineId', (req, res) => {
  if (!req.body || typeof req.body.patch !== 'object' || req.body.patch === null || Array.isArray(req.body.patch)) return res.status(400).json({ message: '请求体必须包含 patch 对象' });
  const result = updateBudgetLine(req.params.id, req.params.lineId, req.body.patch, req.body.actor ?? '当前用户', req.body.requestId);
  if (!result.ok) return res.status(409).json({ message: result.error });
  res.json(result.line);
});
// 资产版本锁定：写入当时的版权冲突快照；存在严重冲突时拒绝并记录失败事件
app.post('/api/projects/:id/assets/:assetId/lock', (req, res) => {
  const result = lockAssetVersion(req.params.id, req.params.assetId, req.body?.actor ?? '当前用户', req.body?.requestId);
  if (!result.ok) return res.status(409).json({ message: result.error });
  res.json(result.asset);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'film-rights-platform' }));
const port = Number(process.env.PORT || 4104); app.listen(port, () => console.log(`film rights API listening on ${port}`));
