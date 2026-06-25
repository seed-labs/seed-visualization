frontend 前端，满足以下要求：
- Vue3 + TypeScript 前端组件
- 组件逻辑和类型独立在 .ts 文件
- 样式独立在 .scss 文件
- 组件复用 props / emits / slots
- 不要把逻辑和样式混杂在同一个文件
- 文件结构符合前端模块化规范

backend 后端，满足以下要求：
- 使用 Node.js + Express
- 路由、控制器、服务分离
- dockerode 封装在 service 文件
- 所有接口返回统一 JSON
- 使用 TypeScript 定义接口和返回值类型

测试要求：
- 源码目录干净，测试不放在源码旁边，而是集中放。
- 所有新增功能必须同时生成测试代码。
- 前端至少包含组件测试、service 测试、关键页面 E2E 测试。
- 后端至少包含 service 单元测试、API 测试、dockerode mock 测试。
- dockerode 真实调用只能放在 integration 测试中，不能写进普通单元测试（真实环境的HOST、PORT等可以写成环境变量文件）。
- API 测试使用 Supertest。
- 前端组件测试使用 Vitest + @testing-library/vue。
- E2E 使用 Playwright。
- 所有测试文件必须与源码结构对应，禁止把大量测试写在一个文件中。
- 测试数据放在 fixtures 目录。
- 每个接口都要测试成功、失败、参数错误、Docker 异常四种情况。
- 每个页面至少测试加载态、空状态、错误状态、正常状态。
- 每次提交前必须通过 lint、typecheck、unit、api、build。