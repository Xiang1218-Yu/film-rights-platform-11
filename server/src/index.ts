import express from 'express';
import { AuditQueryError, queryAuditEvents } from './audit.js';
import { adjustBudgetLine, approve, assets, budgetLines, contracts, createApproval, dashboard, DomainError, lockAsset, projectSummary, projects, rightsConflicts } from './domain.js';

const app = express();
app.use(express.json());

app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/projects', (_req, res) => res.json(projects));
app.get('/api/projects/:id/summary', (req, res) => { const result = projectSummary(req.params.id); if (!result.project) return res.status(404).json({ message: '项目不存在' }); res.json(result); });
app.get('/api/projects/:id/rights-conflicts', (req, res) => res.json(rightsConflicts(req.params.id)));
app.get('/api/projects/:id/assets', (req, res) => res.json(assets.filter(asset => asset.projectId === req.params.id)));
app.get('/api/projects/:id/contracts', (req, res) => res.json(contracts.filter(contract => contract.projectId === req.params.id)));
app.get('/api/budgets/:projectId/lines', (req, res) => res.json(budgetLines.filter(line => line.projectId === req.params.projectId)));

// 项目审计探索器：按实体 / 操作者 / 动作 / 结果 / 时间范围筛选，
// 游标 + watermark 分页保证翻页期间新事件不重复、不遗漏、不乱序。
app.get('/api/projects/:id/audit', (req, res) => {
  if (!projects.some(project => project.id === req.params.id)) return res.status(404).json({ message: '项目不存在' });
  const pick = (key: string) => { const value = req.query[key]; return Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value); };
  try {
    const limit = pick('limit');
    const watermark = pick('watermark');
    res.json(queryAuditEvents({
      projectId: req.params.id,
      entity: pick('entity'),
      entityId: pick('entityId'),
      actor: pick('actor'),
      action: pick('action'),
      result: pick('result'),
      from: pick('from'),
      to: pick('to'),
      cursor: pick('cursor'),
      limit: limit === undefined ? undefined : Number(limit),
      watermark: watermark === undefined ? undefined : Number(watermark),
      role: pick('role') === 'auditor' ? 'auditor' : 'viewer'
    }));
  } catch (error) {
    if (error instanceof AuditQueryError) return res.status(400).json({ message: error.message });
    throw error;
  }
});

app.post('/api/approvals', (req, res) => res.status(201).json(createApproval(req.body)));
app.patch('/api/approvals/:id', (req, res) => {
  try {
    const result = approve(req.params.id, req.body.status, req.body.comment, req.body.actor);
    if (!result) return res.status(404).json({ message: '审批不存在' });
    res.json(result);
  } catch (error) {
    if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
});
app.patch('/api/budgets/:projectId/lines/:lineId', (req, res) => {
  try {
    const result = adjustBudgetLine(req.params.projectId, req.params.lineId, req.body ?? {}, String(req.body?.actor ?? ''), String(req.body?.reason ?? ''));
    if (!result) return res.status(404).json({ message: '预算行不存在' });
    res.json(result);
  } catch (error) {
    if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
});
app.post('/api/assets/:id/lock', (req, res) => {
  try {
    const result = lockAsset(req.params.id, String(req.body?.actor ?? ''));
    if (!result) return res.status(404).json({ message: '资产不存在' });
    res.json(result);
  } catch (error) {
    if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'film-rights-platform' }));
const port = Number(process.env.PORT || 4104); app.listen(port, () => console.log(`film rights API listening on ${port}`));
