import test from 'node:test'; import assert from 'node:assert/strict'; import { approve, auditChain, auditEvents, createApproval, lockAssetVersion, projectSummary, queryAuditEvents, recordAuditEvent, rightsConflicts, updateBudgetLine } from './domain.js';

test('budget summary exposes forecast variance and high risk lines', () => { const summary = projectSummary('PRJ-001'); assert.equal(summary.lines.length, 4); assert.ok(summary.forecast > summary.planned); assert.equal(summary.highRiskLines.length, 1); });
test('rights conflict engine detects overlapping licensed assets', () => { const conflicts = rightsConflicts('PRJ-001'); assert.ok(conflicts.length >= 1); assert.ok(conflicts.some(item => item.reason.includes('音乐-同步许可'))); });
test('approval changes are auditable and stateful', () => { const result = approve('APR-01', 'approved', '预算已复核'); assert.equal(result?.status, 'approved'); assert.equal(result?.comment, '预算已复核'); });

test('legacy audit events are normalized and remain readable', () => {
  const page = queryAuditEvents({ projectId: 'PRJ-001', role: 'auditor' });
  assert.ok(!('error' in page)); if ('error' in page) return;
  const legacy = page.events.find(event => event.id === 'AUD-02'); // 旧事件缺 details，归一化后仍可读
  assert.ok(legacy);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.details, '');
  assert.equal(legacy.result, 'success');
  assert.deepEqual(legacy.relatedIds, []);
  assert.ok(legacy.seq > 0);
});

test('audit explorer filters by entity, actor, action and result with before/after values', () => {
  const updated = updateBudgetLine('PRJ-001', 'BL-103', { forecast: 5900000 }, '后期制片');
  assert.ok(updated.ok);
  const page = queryAuditEvents({ projectId: 'PRJ-001', entity: 'budgetLine', actor: '后期', action: 'update', result: 'success', role: 'auditor' });
  assert.ok(!('error' in page)); if ('error' in page) return;
  assert.equal(page.events.length, 1);
  const event = page.events[0];
  assert.equal(event.before.forecast, 5750000);
  assert.equal(event.after.forecast, 5900000);
  assert.ok(event.relatedIds.includes('BUD-001-V3'));
});

test('sensitive fields are masked for viewers and visible to auditors', () => {
  recordAuditEvent({ projectId: 'PRJ-001', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '后期制片', before: { checksum: 'sha256:old', status: 'review' }, after: { checksum: 'sha256:new', status: 'approved' } });
  const viewer = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-001', action: 'UPDATE' });
  const auditor = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-001', action: 'UPDATE', role: 'auditor' });
  assert.ok(!('error' in viewer) && !('error' in auditor)); if ('error' in viewer || 'error' in auditor) return;
  assert.equal(viewer.masked, true);
  assert.equal(viewer.events[0].after.checksum, '***');
  assert.equal(viewer.events[0].after.status, 'approved');
  assert.equal(auditor.events[0].after.checksum, 'sha256:new');
});

test('half-written events are rejected atomically without polluting the log', () => {
  const size = auditEvents.length;
  assert.equal(recordAuditEvent({ projectId: 'PRJ-001', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '' }).ok, false);
  assert.equal(recordAuditEvent({ projectId: '', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '后期制片' }).ok, false);
  assert.equal(recordAuditEvent({ projectId: 'PRJ-001', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '后期制片', before: 'oops' as unknown as Record<string, unknown> }).ok, false);
  assert.equal(recordAuditEvent({ projectId: 'PRJ-001', action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '后期制片', at: 'not-a-date' }).ok, false);
  assert.equal(auditEvents.length, size);
});

test('duplicate replay is deduplicated by event id', () => {
  const size = auditEvents.length;
  const first = recordAuditEvent({ id: 'EVT-REPLAY-1', projectId: 'PRJ-001', action: 'UPDATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任' });
  const second = recordAuditEvent({ id: 'EVT-REPLAY-1', projectId: 'PRJ-001', action: 'UPDATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任' });
  assert.ok(first.ok && second.ok); if (!first.ok || !second.ok) return;
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.event.seq, first.event.seq);
  assert.equal(auditEvents.length, size + 1);
});

test('queries are scoped to one project and cross-project attempts are audited as failures', () => {
  const denied = lockAssetVersion('PRJ-001', 'AST-004', '视觉总监'); // AST-004 属于 PRJ-002
  assert.equal(denied.ok, false);
  const prj1 = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-004', role: 'auditor' });
  const prj2 = queryAuditEvents({ projectId: 'PRJ-002', entityId: 'AST-004', role: 'auditor' });
  assert.ok(!('error' in prj1) && !('error' in prj2)); if ('error' in prj1 || 'error' in prj2) return;
  assert.ok(prj1.events.some(event => event.result === 'failure'));
  assert.ok(prj1.events.every(event => event.projectId === 'PRJ-001'));
  assert.equal(prj2.events.length, 0); // 失败尝试只记在发起方项目，不泄漏到对方项目
  const chain = auditChain('PRJ-002', prj1.events[0].id);
  assert.equal(chain, undefined); // 跨项目不展开因果链
});

test('time filters are inclusive at both boundaries and validated', () => {
  const at = '2026-09-15T10:00:00.000Z';
  recordAuditEvent({ id: 'EVT-TIME-1', projectId: 'PRJ-001', action: 'UPDATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at });
  const exact = queryAuditEvents({ projectId: 'PRJ-001', from: at, to: at });
  assert.ok(!('error' in exact) && exact.events.some(event => event.id === 'EVT-TIME-1'));
  const before = queryAuditEvents({ projectId: 'PRJ-001', to: '2026-09-15T09:59:59.999Z' });
  assert.ok(!('error' in before) && before.events.every(event => event.id !== 'EVT-TIME-1'));
  const dayOnly = queryAuditEvents({ projectId: 'PRJ-001', from: '2026-09-15', to: '2026-09-15' }); // 纯日期 to 延展到当日结束
  assert.ok(!('error' in dayOnly) && dayOnly.events.some(event => event.id === 'EVT-TIME-1'));
  assert.ok('error' in queryAuditEvents({ projectId: 'PRJ-001', from: 'not-a-date' }));
  assert.ok('error' in queryAuditEvents({ projectId: 'PRJ-001', from: '2026-09-16', to: '2026-09-15' }));
});

test('causal order is stable and events appended during filtering do not shift cursor pages', () => {
  const first = queryAuditEvents({ projectId: 'PRJ-001', limit: 3, role: 'auditor' });
  assert.ok(!('error' in first) && first.nextCursor !== null); if ('error' in first || first.nextCursor === null) return;
  const seqs = first.events.map(event => event.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a)); // 默认按因果序号倒序
  recordAuditEvent({ projectId: 'PRJ-001', action: 'UPDATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', details: '筛选期间新增的事件' });
  const second = queryAuditEvents({ projectId: 'PRJ-001', limit: 3, beforeSeq: first.nextCursor, role: 'auditor' });
  assert.ok(!('error' in second)); if ('error' in second) return;
  assert.ok(second.events.length > 0);
  assert.ok(second.events.every(event => event.seq < (first.nextCursor as number))); // 新事件 seq 更大，不会进入已开始的翻页
});

test('locking an asset with a critical rights conflict fails and is audited with the conflict context', () => {
  const result = lockAssetVersion('PRJ-001', 'AST-001', '后期制片'); // 与已锁定的 AST-003 存在严重冲突
  assert.equal(result.ok, false);
  const page = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-001', action: 'LOCK', result: 'failure', role: 'auditor' });
  assert.ok(!('error' in page)); if ('error' in page) return;
  assert.equal(page.events.length, 1);
  assert.ok(page.events[0].relatedIds.includes('AST-003'));
  assert.ok(page.events[0].details.includes('严重版权冲突'));
});

test('locking a clean asset succeeds and snapshots the rights conflicts at that moment', () => {
  const result = lockAssetVersion('PRJ-001', 'AST-002', '营销部');
  assert.ok(result.ok);
  const page = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-002', action: 'LOCK', result: 'success', role: 'auditor' });
  assert.ok(!('error' in page)); if ('error' in page) return;
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].before.status, 'approved');
  assert.equal(page.events[0].after.status, 'locked');
  assert.equal(page.events[0].after.conflictsAtLock, 0);
});

test('invalid approval transitions are rejected, audited as failures, and comments are masked', () => {
  const approval = createApproval({ projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '宣发预算调整测试', requestedBy: '营销部', approver: '财务负责人' });
  assert.ok(approval);
  assert.ok(approve(approval.id, 'approved', '同意调整', '财务负责人'));
  assert.equal(approve(approval.id, 'rejected', '重复操作', '财务负责人'), undefined); // 已终态，拒绝重复迁移
  const failures = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'BUD-001-V3', result: 'failure', role: 'auditor' });
  assert.ok(!('error' in failures)); if ('error' in failures) return;
  assert.ok(failures.events.some(event => event.relatedIds.includes(approval.id) && event.details.includes('状态迁移被拒绝')));
  const viewer = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'BUD-001-V3', action: 'APPROVED' });
  assert.ok(!('error' in viewer)); if ('error' in viewer) return;
  const event = viewer.events.find(item => item.relatedIds.includes(approval.id));
  assert.ok(event);
  assert.equal(event.after.comment, '***'); // 审批意见属敏感字段，访客脱敏
});

test('audit chain links budget change, approval and lock in causal order within one project', () => {
  const updated = updateBudgetLine('PRJ-001', 'BL-104', { forecast: 3300000 }, '营销部');
  assert.ok(updated.ok);
  const approval = createApproval({ projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '宣发预测调整', requestedBy: '营销部', approver: '财务负责人' });
  assert.ok(approval);
  approve(approval.id, 'approved', '同意', '财务负责人');
  const updates = queryAuditEvents({ projectId: 'PRJ-001', entity: 'budgetLine', entityId: 'BL-104', role: 'auditor' });
  assert.ok(!('error' in updates) && updates.events.length === 1); if ('error' in updates) return;
  const chain = auditChain('PRJ-001', updates.events[0].id, 'auditor');
  assert.ok(chain); if (!chain) return;
  assert.ok(chain.some(event => event.entity === 'budgetLine' && event.entityId === 'BL-104'));
  assert.ok(chain.some(event => event.action === 'APPROVED' && event.relatedIds.includes(approval.id)));
  const seqs = chain.map(event => event.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b)); // 因果链按 seq 升序
  assert.ok(chain.every(event => event.projectId === 'PRJ-001'));
  assert.equal(auditChain('PRJ-002', updates.events[0].id), undefined);
});
