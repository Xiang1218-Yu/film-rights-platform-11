import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAuditEvent, AuditQueryError, queryAuditEvents } from './audit.js';
import { adjustBudgetLine, approve, DomainError, lockAsset } from './domain.js';

const find = (projectId: string, id: string) => queryAuditEvents({ projectId, limit: 100, role: 'auditor' }).events.find(event => event.id === id);

test('按实体、操作者、动作、结果筛选项目事件', () => {
  const byEntity = queryAuditEvents({ projectId: 'PRJ-001', entity: 'budget' });
  assert.ok(byEntity.events.length >= 2);
  assert.ok(byEntity.events.every(event => event.entity === 'budget'));
  const byActor = queryAuditEvents({ projectId: 'PRJ-001', actor: '后期制片' });
  assert.ok(byActor.events.length >= 1);
  assert.ok(byActor.events.every(event => event.actor === '后期制片'));
  const byAction = queryAuditEvents({ projectId: 'PRJ-001', action: 'LOCK' });
  assert.ok(byAction.events.some(event => event.entityId === 'AST-003'));
  const failures = queryAuditEvents({ projectId: 'PRJ-001', result: 'failure' });
  assert.ok(failures.events.length >= 1);
  assert.ok(failures.events.every(event => event.result === 'failure'));
  assert.ok(failures.events.some(event => event.id === 'AUD-103'));
});

test('事件呈现前后值、关联 ID 与失败结果', () => {
  const adjusted = find('PRJ-001', 'AUD-102');
  assert.equal(adjusted?.before?.forecast, 5400000);
  assert.equal(adjusted?.after?.forecast, 5750000);
  assert.deepEqual(adjusted?.relatedIds, ['BUD-001-V3', 'BL-103']);
  const failed = find('PRJ-001', 'AUD-103');
  assert.equal(failed?.result, 'failure');
  assert.match(failed?.details ?? '', /校验拒绝/);
});

test('旧事件规范化后可读：默认结果、归属解析与 legacy 标记', () => {
  const legacy = find('PRJ-001', 'AUD-01');
  assert.equal(legacy?.legacy, true);
  assert.equal(legacy?.result, 'success');
  assert.equal(legacy?.before, null);
  assert.equal(legacy?.projectId, 'PRJ-001');
  assert.equal(legacy?.incomplete, false);
});

test('敏感字段对访客脱敏、对审计员可见', () => {
  const viewer = queryAuditEvents({ projectId: 'PRJ-001', role: 'viewer' }).events.find(event => event.id === 'AUD-102');
  assert.equal(viewer?.after?.forecast, '***');
  assert.equal(viewer?.before?.forecast, '***');
  assert.equal(viewer?.redacted, true);
  const auditor = queryAuditEvents({ projectId: 'PRJ-001', role: 'auditor' }).events.find(event => event.id === 'AUD-102');
  assert.equal(auditor?.after?.forecast, 5750000);
  assert.equal(auditor?.redacted, false);
});

test('翻页期间新增事件不重复、不遗漏、不越进水线', () => {
  const stamp = Date.now();
  for (let i = 1; i <= 3; i += 1) {
    appendAuditEvent({ id: `AUD-P${stamp}-${i}`, action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '分页测试', at: new Date(stamp + i * 1000).toISOString(), before: { version: i }, after: { version: i + 1 } });
  }
  const page1 = queryAuditEvents({ projectId: 'PRJ-001', actor: '分页测试', limit: 2 });
  assert.equal(page1.events.length, 2);
  assert.ok(page1.nextCursor);
  appendAuditEvent({ id: `AUD-P${stamp}-4`, action: 'UPDATE', entity: 'asset', entityId: 'AST-001', actor: '分页测试', at: new Date(stamp + 4000).toISOString(), before: { version: 4 }, after: { version: 5 } });
  const page2 = queryAuditEvents({ projectId: 'PRJ-001', actor: '分页测试', limit: 2, cursor: page1.nextCursor ?? undefined, watermark: page1.watermark });
  const ids = [...page1.events, ...page2.events].map(event => event.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes(`AUD-P${stamp}-4`), false);
  assert.equal(page2.events.length, 1);
  assert.equal(page2.events[0].id, `AUD-P${stamp}-3`);
});

test('缺字段与半写入事件保留在因果序中并打标记', () => {
  const halfWritten = find('PRJ-001', 'AUD-104');
  assert.equal(halfWritten?.incomplete, true);
  assert.equal(halfWritten?.at, halfWritten?.recordedAt);
  const missingActor = find('PRJ-002', 'AUD-105');
  assert.equal(missingActor?.incomplete, true);
  assert.equal(missingActor?.actor, '未知');
  const ordered = queryAuditEvents({ projectId: 'PRJ-001', limit: 100 }).events;
  const seqs = ordered.map(event => event.seq);
  assert.deepEqual([...seqs].sort((a, b) => a - b), seqs.length ? ordered.map(e => e.seq).sort((a, b) => a - b) : []);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = Date.parse(ordered[i - 1].at);
    const curr = Date.parse(ordered[i].at);
    assert.ok(prev < curr || (prev === curr && ordered[i - 1].seq < ordered[i].seq));
  }
});

test('重复重放同 id 事件只保留首次写入', () => {
  const input = { id: `AUD-R${Date.now()}`, action: 'UPDATE', entity: 'budget', entityId: 'BL-101', actor: '重放源', before: { forecast: 1 }, after: { forecast: 2 } };
  const first = appendAuditEvent(input);
  const replay = appendAuditEvent(input);
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.event.seq, first.event.seq);
  const matched = queryAuditEvents({ projectId: 'PRJ-001', actor: '重放源', limit: 100 }).events.filter(event => event.id === input.id);
  assert.equal(matched.length, 1);
});

test('跨项目访问被隔离：他项目事件与他项目实体均不可见', () => {
  const scoped = queryAuditEvents({ projectId: 'PRJ-001', limit: 100 }).events;
  assert.ok(scoped.length > 0);
  assert.ok(scoped.every(event => event.projectId === 'PRJ-001'));
  assert.equal(queryAuditEvents({ projectId: 'PRJ-001', entityId: 'DEL-007' }).total, 0);
  assert.equal(queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-004' }).total, 0);
  const other = queryAuditEvents({ projectId: 'PRJ-002', limit: 100 }).events;
  assert.ok(other.some(event => event.entityId === 'DEL-007'));
});

test('时间边界：闭区间、日期展开与非法输入', () => {
  const target = find('PRJ-001', 'AUD-102');
  assert.ok(target);
  const day = target.at.slice(0, 10);
  const ranged = queryAuditEvents({ projectId: 'PRJ-001', from: day, to: day });
  assert.ok(ranged.events.some(event => event.id === 'AUD-102'));
  const exact = queryAuditEvents({ projectId: 'PRJ-001', from: target.at, to: target.at });
  assert.ok(exact.events.some(event => event.id === 'AUD-102'));
  const before = queryAuditEvents({ projectId: 'PRJ-001', to: new Date(Date.parse(target.at) - 1).toISOString() });
  assert.equal(before.events.some(event => event.id === 'AUD-102'), false);
  assert.throws(() => queryAuditEvents({ projectId: 'PRJ-001', from: day, to: '2020-01-01' }), AuditQueryError);
  assert.throws(() => queryAuditEvents({ projectId: 'PRJ-001', from: 'not-a-date' }), AuditQueryError);
  assert.throws(() => queryAuditEvents({ projectId: 'PRJ-001', cursor: 'bad-cursor' }), AuditQueryError);
});

test('倒填时间的事件仍按 (at, seq) 因果序输出', () => {
  const stamp = Date.now();
  appendAuditEvent({ id: `AUD-B${stamp}-1`, action: 'UPDATE', entity: 'asset', entityId: 'AST-002', actor: '因果测试', at: '2026-01-01T00:00:01.000Z', before: { v: 1 }, after: { v: 2 } });
  appendAuditEvent({ id: `AUD-B${stamp}-2`, action: 'UPDATE', entity: 'asset', entityId: 'AST-002', actor: '因果测试', at: '2026-01-01T00:00:01.000Z', before: { v: 2 }, after: { v: 3 } });
  appendAuditEvent({ id: `AUD-B${stamp}-3`, action: 'UPDATE', entity: 'asset', entityId: 'AST-002', actor: '因果测试', at: '2025-12-31T23:59:59.000Z', before: { v: 0 }, after: { v: 1 } });
  const ordered = queryAuditEvents({ projectId: 'PRJ-001', actor: '因果测试', limit: 100 }).events;
  assert.deepEqual(ordered.map(event => event.id), [`AUD-B${stamp}-3`, `AUD-B${stamp}-1`, `AUD-B${stamp}-2`]);
});

test('审批重放被拒绝并留下失败事件', () => {
  const approved = approve('APR-01', 'approved', '预算已复核');
  assert.equal(approved?.status, 'approved');
  assert.throws(() => approve('APR-01', 'approved'), (error: unknown) => error instanceof DomainError && (error as DomainError).status === 409);
  const failures = queryAuditEvents({ projectId: 'PRJ-001', result: 'failure', entity: 'budget', limit: 100 }).events;
  assert.ok(failures.some(event => event.entityId === 'BUD-001-V3' && /重复操作/.test(event.details)));
});

test('预算调整与资产锁定写入完整审计链', () => {
  const line = adjustBudgetLine('PRJ-001', 'BL-102', { forecast: 7100000 }, '现场制片', '器材涨价');
  assert.equal(line?.forecast, 7100000);
  assert.throws(() => adjustBudgetLine('PRJ-001', 'BL-102', { planned: 100 }, '现场制片'), DomainError);
  assert.equal(adjustBudgetLine('PRJ-001', 'BL-201', { forecast: 1 }, '越权测试'), undefined);
  const locked = lockAsset('AST-001', '总制片人');
  assert.equal(locked?.status, 'locked');
  assert.throws(() => lockAsset('AST-001', '总制片人'), (error: unknown) => error instanceof DomainError && (error as DomainError).status === 409);
  const trail = queryAuditEvents({ projectId: 'PRJ-001', entityId: 'AST-001', action: 'LOCK', limit: 100 }).events;
  const lockEvent = trail.find(event => event.result === 'success');
  assert.equal(lockEvent?.before?.status, 'review');
  assert.equal(lockEvent?.after?.status, 'locked');
  assert.ok((lockEvent?.context?.conflicts?.length ?? 0) >= 1);
  assert.ok(trail.some(event => event.result === 'failure'));
});
