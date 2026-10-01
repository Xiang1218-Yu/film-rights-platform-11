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
- 项目审计探索器：按项目、实体、操作者、时间、动作与结果筛选事件，呈现前后值、关联 ID、失败结果与锁定当时的版权冲突快照
- React 控制台支持项目切换、预算表、风险雷达、审批操作、版权资产视图与审计时间线

## 审计探索器

`GET /api/projects/:id/audit` 支持 `entity` / `entityId` / `actor` / `action` / `result` / `from` / `to` / `cursor` / `limit` / `watermark` / `role` 参数：

- 事件追加即分配单调递增 `seq`，查询按 `(at, seq)` 因果序输出；`cursor` + `watermark` 分页保证翻页期间新写入事件不重复、不遗漏、不越进快照
- 同 `id` 重复重放只保留首次写入；缺字段与半写入事件规范化后打 `incomplete` 标记，仍保留在因果序中
- 项目范围为硬边界，跨项目事件与实体不可见；`from` / `to` 为闭区间，日期型按当天起止展开
- 敏感字段（预算金额等）默认脱敏为 `***`，`role=auditor` 时可见原值
- 配套事件源：`PATCH /api/budgets/:projectId/lines/:lineId` 调整预算、`POST /api/assets/:id/lock` 锁定版本、`PATCH /api/approvals/:id` 审批，失败尝试同样留痕

当前使用内存数据，领域服务按模块设计，后续可替换 PostgreSQL、对象存储、工作流和版权方台账服务。
