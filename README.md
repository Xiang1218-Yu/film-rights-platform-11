# FrameLedger · 影视制作预算与资产版权协同平台

React + Vite + TypeScript 前端，Node.js + Express + TypeScript 服务端。面向中型影视制作团队，演示预算版本、成本预测、合同里程碑、资产版本、授权窗口冲突与审批审计的协同闭环。

## 启动

```bash
npm install
npm run dev
```

前端默认 Vite 端口 5175，API 默认 `http://localhost:4104`。

## 业务能力

- 项目 / 季 / 交付日期与预算基线；计划、承诺、实际、预测成本四账合一
- 供应商合同额度、付款里程碑与付款暴露额
- 母版、预告、海报、音频、字幕等资产版本和 checksum 登记
- 地域、平台、有效期、版权标签冲突检测
- 预算 / 资产 / 交付审批队列和审计事件
- 项目审计探索器：按项目、实体、操作者、时间、动作与成败结果筛选，呈现前后值、关联 ID 与失败原因，支持因果链展开
- React 控制台支持项目切换、预算表、风险雷达、审批操作、版权资产视图与审计探索器

## 审计探索器

- `GET /api/projects/:id/audit`：范围固定在单个项目（跨项目 `projectId` 返回 403），支持 `entity` / `entityId` / `actor` / `action` / `result` / `from` / `to`（含边界，纯日期的 `to` 延展到当日结束）/ `beforeSeq` 游标 / `limit` / `role`
- `GET /api/projects/:id/audit/:eventId/chain`：单事件在**同项目内**沿 `relatedIds` 展开的因果链，按因果序号 `seq` 升序
- 事件 schemaVersion 2：前后值（before/after）、关联 ID、成败结果；旧版扁平事件入库时归一化，缺字段仍可读
- 敏感字段（checksum / comment / paid）对非审计员角色脱敏为 `***`
- 写入保证：缺字段 / 非法字段整体拒绝不留半写入；显式 `id` 重复重放去重；`requestId` 幂等；失败操作同样落审计事件
- 产生审计事件的操作：`PATCH /api/projects/:id/budget-lines/:lineId`（预算调整，含前后值）、`POST /api/projects/:id/assets/:assetId/lock`（版本锁定，附当时版权冲突快照，严重冲突拒绝）、审批创建与状态迁移

当前使用内存数据，领域服务按模块设计，后续可替换 PostgreSQL、对象存储、工作流和版权方台账服务。
