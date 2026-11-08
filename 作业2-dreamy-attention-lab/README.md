# 作业 2 · Dreamy Attention Lab（梦境注意实验室）

本目录是课程作业 2 的提交版本。项目实现了一个可在浏览器中运行的在线认知心理学实验平台，当前向被试开放两项实验：

1. **视觉搜索（Visual Search）**
2. **地图对齐（Map Alignment）**

平台包含被试入口、练习与正式试次、独立 Block、逐试次数据记录、可选摄像头注视估计、离线重传、研究者后台、结果页和 CSV / JSON 导出。

- **在线实验地址**：<https://web-production-e1f4a.up.railway.app>
- **技术栈**：React 19 + TypeScript + Vite + Tailwind CSS；Express；SQLite（Node 内置 `node:sqlite`）
- **运行环境**：Node.js ≥ 22.5（开发与验证使用 Node 24.20）
- **说明**：本提交只包含代码、配置和文档，不包含任何正式参与者数据、数据库、`.env` 或密钥。

---

## 1. 项目概述

Dreamy Attention Lab 是一个研究用途的浏览器实验平台。视觉风格与正式刺激区域分离：正式试次只保留刺激、问题、按键提示和必要的流程信息，不使用装饰性动画、动态背景或无关弹窗。

平台的设计目标是：

- 让被试可以在普通桌面浏览器中完成实验；
- 把练习与正式试次、原始 Block 与扩展 Block 明确分开；
- 逐试次保存刺激参数、反应、正确性和反应时；
- 对浏览器计时与 WebGazer 注视估计的效度边界作明确说明；
- 不伪造数据、不把鼠标轨迹当作眼动、不把探索性指标写成确定性结论。

> **重要边界**：这是浏览器行为实验平台，不是经过光电二极管校准的实验室呈现系统。刷新率、设备性能、浏览器合成路径与系统缩放都会进入计时误差。WebGazer 的注视估计是探索性近似测量，原始视频不会上传或保存。

---

## 2. 当前开放的实验

被试入口只开放以下两项。`perceptual-ordering`（图形知觉排序）的代码与数据库类型仍保留，用于历史会话兼容，但已不在当前被试目录中开放，因此本作业不把它作为正式数据收集任务。

### 2.1 视觉搜索（Visual Search）

**任务**：判断字母阵列中是否存在一个**红色、正立的字母 O**。

| 项目 | 设置 |
| --- | --- |
| 目标 | 红色 `O` |
| 反应键 | `F` = 存在；`J` = 不存在 |
| 集合大小 | 4、8、16、24 |
| 网格 | 10 列 × 6 行，单元内加入轻微抖动 |
| 练习 | 每个 Block 2 个练习试次（不计入正式分析） |
| 反应时限 | 4000 ms |
| 正式试次 | Block 1：10；Block 2：10；Block 3：15 |
| 反馈 | 正式试次无逐试次对错反馈 |

三个 Block 依次进行：

1. **Block 1 · 特征搜索（颜色）**  
   干扰项为蓝色 `O` 与蓝色 `X`。目标在颜色上是唯一的，理论上可以进行颜色特征搜索。
2. **Block 2 · 联合搜索（颜色 × 形状）**  
   干扰项为红色 `X` 与蓝色 `O`。目标需要同时满足“红色”和“O”两个特征，理论上需要特征绑定。
3. **Block 3 · 空间位置搜索**  
   目标仍为红色 `O`，干扰项为红色 `X` 与蓝色 `O`。默认 15 个正式试次中，9 个目标存在试次覆盖 3 × 3 的九个区域各一次，另外 6 个为目标缺席试次；区域效应只作描述性、探索性分析。

**记录内容**：按键、正确性、反应时、集合大小、目标是否存在、目标区域、逐项字母坐标，以及可选的鼠标轨迹和 WebGazer 注视估计。

**关于斜率**：Block 1 和 Block 2 各只有 10 个正式试次，分配到 4 个集合大小 × 2 种目标存在性后，单个条件单元只有 1–2 个试次。平台仍可在至少两个集合大小有正确试次时拟合探索性斜率，但这种斜率不稳定，必须标注为探索性，不能当作稳定的搜索斜率估计。

**眼动与鼠标**：视觉搜索支持可选的 WebGazer 注视估计。被试在练习后单独同意才会请求摄像头；拒绝或摄像头不可用时实验继续。注视样本与鼠标轨迹分别存储、分别分析，不会合并成一条“真实扫描轨迹”。鼠标轨迹只是行为代理，不是眼动数据。

### 2.2 地图对齐（Map Alignment）

**任务**：阅读一张方向固定的俯视校园地图中央的位置标记，判断金圈标出的目标建筑相对于“你当前面朝方向”的方位。

#### 固定地图

地图方向固定，建筑位置固定：

| 建筑 | 屏幕位置 | 世界方位 |
| --- | --- | --- |
| 实验楼 | 上 | 0° |
| 食堂 | 右 | 90° |
| 图书馆 | 下 | 180° |
| 教学楼 | 左 | 270° |

地图、建筑标签、指南针在试次之间都不旋转。每个试次变化的是被试的**朝向**，而不是地图。

#### 两种线索条件

| Block | 条件 | 中央线索 |
| --- | --- | --- |
| `ma_no_cue` | 无人物线索 | 普通红色位置圆点 |
| `ma_person_cue` | 人物线索 | 俯视小人，头部与身体指向当前朝向 |

两个 Block 的顺序按参与者编号在被试间平衡。每个 Block 先做 2 个练习试次，再做 15 个正式试次。

#### 朝向与对齐

- `headingDeg = 0°`：面朝屏幕上方（实验楼），为 **aligned（对齐）**。
- `headingDeg = 90° / 180° / 270°`：分别面朝屏幕右方（食堂）、下方（图书馆）、左方（教学楼），为 **misaligned（不对齐）**。

每个 Block 的 15 个正式试次都包含四种朝向，次数为 0° = 3、90° = 4、180° = 4、270° = 4；对齐试次 3 个，不对齐试次 12 个。

#### 正确答案的计算

正确答案由目标建筑的实际屏幕方位减去当前朝向得到：

```text
relative = normalizeDegrees(targetBearingDeg - headingDeg)
0°   = 前方
90°  = 右方
180° = 后方
270° = 左方
```

其中 `targetBearingDeg` 使用固定地图中的建筑方位（实验楼 0°、食堂 90°、图书馆 180°、教学楼 270°）。人物线索只改变中央图形的外观，不改变题目或正确答案。

正式试次中，目标建筑从不等于当前面朝的建筑，因此正确答案只可能是右方、后方或左方；“前方”按键保留用于练习和键盘映射完整性。

四个可核查的例子：

| 当前朝向 | 目标建筑 | 目标相对方向 |
| --- | --- | --- |
| 0°（面朝实验楼） | 食堂 | 右方 |
| 90°（面朝食堂） | 教学楼 | 后方 |
| 180°（面朝图书馆） | 教学楼 | 右方 |
| 270°（面朝教学楼） | 实验楼 | 右方 |

**反应**：方向键，`↑` 前方、`↓` 后方、`←` 左方、`→` 右方。地图、朝向文字和问题同时出现，出现后即可作答；默认没有反应时限。正式试次无逐试次对错反馈。

**记录内容**：朝向角、地图旋转（固定为 0）、线索条件、目标建筑、目标方位、正确方向、按键、正确性、反应时、练习/正式阶段、Block 顺序和注意力监测字段。

**结果分析**：按真实朝向角区分 aligned / misaligned；比较无人物线索与人物线索条件下的正确率和正确反应时；计算不对齐代价（misaligned − aligned）；并描述线索 × 对齐条件的交互。所有分析以参与者为单位汇总，练习试次不进入正式统计。

### 2.3 图形知觉排序（归档，不开放在被试入口）

代码中仍保留 `perceptual-ordering` 的生成器、任务与历史数据类型，用于读取旧会话；当前 `ACTIVE_EXPERIMENT_IDS` 只包含视觉搜索和地图对齐，因此本作业不收集该实验的新数据，也不为它设置正式预测。

---

## 3. 实验预测

本作业的预注册预测单独保存在 **[PREDICTIONS.md](./PREDICTIONS.md)**，并在正式数据收集之前作为独立 Git commit 提交。

预测只给出方向性假设与分析计划，不预设具体均值、标准差或显著性结论。当前仓库中没有任何正式参与者数据，因此本 README 不报告“已验证”或“已支持”的结果。

---

## 4. 数据记录与分析约定

- 每个试次立即写入浏览器本地 outbox，再按顺序上传；`trial_id` 幂等，网络重试不会产生重复行。
- 每个会话保存创建时的配置快照与版本号；研究者修改配置只影响后续新会话。
- 练习试次单独保存，但不进入准确率、反应时或组统计。
- 正确率使用全部正式试次；超时和未作答计入错误。
- 平均反应时与中位反应时只使用正确、未超时且按键有效的试次。
- 群体结果只纳入已完成会话，先按参与者汇总，再计算组均值；样本量不足时显示警告，不把个人数据与文献均值做显著性检验。
- 视觉搜索的 WebGazer 数据只有在质量阈值达标时才用于方向性描述；质量不足时保留原始样本但不绘制可能误导的热图。
- 地图实验的分析角度使用真实朝向 `heading_deg`，不使用地图旋转；旧版本遗留数据中的非零地图旋转会按旧字段兼容读取。

核心试次字段：

```text
participant_id, experiment_id, session_id, trial_id, trial_index,
block_id, block_type, condition_id, phase,
stimulus_onset, response_time, response, correct, timestamp,
eye_tracking_status, calibration_status, calibration_quality,
valid_gaze_ratio, valid_mouse_ratio
```

实验特有参数保存在 `stimulus`、`response_data`、`tracking`、`metadata` JSON 中。生产数据库位于 Railway 持久卷的 `/data/lab.db`，不包含在本仓库中。

### 课程作业收数平台

每完成一个实验，客户端会向课程作业数据收集平台自动提交一次紧凑试次数据。使用的六位项目码 `TYJKZF` 是公开项目码，不是下载密钥；下载密钥没有写入前端代码、配置或本仓库。

- 三个实验使用不同的 `experiment` 标识：`dreamy_visual_search`、`dreamy_map_alignment`、`dreamy_perceptual_ordering`。`perceptual-ordering` 当前不在被试目录中开放，因此不会产生新的正式数据；其映射保留供将来使用。
- 每个试次提交 `cond`、`rt`、`correct`、`phase`、`block`、`timeout` 等通用字段，以及实验特有字段：视觉搜索的集合大小/目标位置，地图对齐的朝向/线索/目标建筑，知觉排序的难度/顺序/位置误差。
- `rt = -1` 表示该试次超时或未作答，`timeout` 字段另行标记。
- 原始眼动与鼠标样本不上传；只上传样本数、有效比例、注视次数、路径长度等汇总值。原始样本仍保存在本平台自己的离线队列和数据库中。
- 顶层 `participant` 使用系统生成的匿名编号 `DCL-XXXXXXXX`，不使用被试输入的编号，不包含姓名、学号或联系方式。老师平台的数据视图会把顶层 `participant` 匿名成按实验编号的 `P01`/`P02`；为便于在下载的逐试次数据中跨实验配对，每条试次还包含同一个匿名编号的 `anon` 字段。
- 每个会话自动提交一次；成功后不会自动重复提交。提交失败时本地数据保留，结果页顶部显示失败原因与「重试上传」按钮。重复提交防护是本地状态与稳定会话标识，不依赖老师接口的幂等性。

---

## 5. 本地运行

### 5.1 安装与开发模式

```bash
cd 作业2-dreamy-attention-lab
npm install
npm run dev
```

启动后：

- 前端：<http://localhost:5173>
- API 健康检查：<http://localhost:3001/api/health>
- 研究者登录：<http://localhost:5173/researcher/login>

开发模式允许使用本地默认研究者账号；生产环境必须通过环境变量设置账号、密码和签名密钥。

### 5.2 环境变量

复制 `.env.example` 为 `.env`，至少检查：

```text
NODE_ENV=development
PORT=3001
DATA_DIR=./data

RESEARCHER_USERNAME=researcher
RESEARCHER_PASSWORD=replace-with-a-long-password
AUTH_SECRET=replace-with-a-random-secret-at-least-24-chars
```

生产环境要求：

- `RESEARCHER_PASSWORD` 至少 8 个字符；
- `AUTH_SECRET` 至少 24 个字符；
- 不要把真实 `.env`、数据库或 `.auth-secret` 提交到 Git。

### 5.3 生产构建

```bash
npm run build
npm start
```

`npm run build` 会执行 TypeScript 类型检查、Vite 前端构建和服务端编译；`npm start` 启动 `dist-server/server/index.js`，同时提供静态前端与 API。

### 5.4 Docker

```bash
docker build -t dreamy-attention-lab .
docker run --rm -p 3001:3001 \
  -e RESEARCHER_USERNAME=researcher \
  -e RESEARCHER_PASSWORD='replace-with-a-long-password' \
  -e AUTH_SECRET='replace-with-a-random-secret-at-least-24-chars' \
  -v dreamy-data:/data \
  dreamy-attention-lab
```

`Dockerfile` 使用多阶段构建；运行阶段以非 root 用户启动，持久化目录为 `/data`。健康检查路径为 `/api/health`。

### 5.5 检查与测试

```bash
npm run typecheck   # 前端 + 服务端 TypeScript
npm test            # Vitest：生成器、结果聚合、API 集成测试
npm run test:e2e    # Playwright 端到端测试（需安装浏览器）
npm run build       # 类型检查 + 前端构建 + 服务端编译
```

端到端测试默认使用本地开发研究者账号，可通过 `RESEARCHER_USERNAME` / `RESEARCHER_PASSWORD` 覆盖。

---

## 6. Railway 部署

生产站点：<https://web-production-e1f4a.up.railway.app>

本仓库包含：

- `Dockerfile`：多阶段构建与运行镜像；
- `railway.json`：Dockerfile 构建、`/api/health` 健康检查与失败重启策略；
- `.railway/railway.ts`：Railway 基础设施即代码描述（服务、持久卷与区域）；
- `docker-entrypoint.sh`：运行前准备数据目录并切换非 root 用户。

生产环境需要设置 `RESEARCHER_USERNAME`、`RESEARCHER_PASSWORD`、`AUTH_SECRET` 等变量。生产数据库与持久卷数据不属于本仓库，也不会被提交。

> 本课程提交不包含部署操作说明之外的自动化部署步骤；请勿在未确认环境变量的情况下直接部署。

---

## 7. 目录结构

```text
作业2-dreamy-attention-lab/
  src/
    experiments/
      visual-search/       视觉搜索生成器、任务、WebGazer 与鼠标轨迹
      map-alignment/       地图对齐生成器、固定地图 SVG、任务运行时
      perceptual-ordering/ 归档实验代码（当前不开放）
      shared/              会话/Block 运行时、汇总、注意力监测、按键
      instructions/        说明页示例刺激
    pages/                 落地页、实验目录、被试入口、说明、结果、研究者后台
    services/              API、离线队列、本地存储
    components/            设计系统、品牌、实验插画、结果图表
    styles/                全局样式与响应式
  server/                  Express API、SQLite、认证、结果聚合、导出、文献
  shared/                  前后端共享类型、配置、Block 构建、搜索指标
  public/                  图标与本地 WebGazer 资源
  tests/e2e/               Playwright 流程测试
  package.json
  package-lock.json
  index.html
  tsconfig.json
  tsconfig.server.json
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  tailwind.config.js
  postcss.config.js
  Dockerfile
  docker-entrypoint.sh
  railway.json
  .railway/railway.ts
  .env.example
  ASSET_LICENSES.md
  README.md
  PREDICTIONS.md
```

以下内容被 `.gitignore` 排除：`node_modules/`、`dist/`、`dist-server/`、`data/`、SQLite 数据库及 WAL/SHM 文件、`.env`、签名密钥、日志、测试产物和本地截图。

---

## 8. AI 使用情况

本项目在实现过程中使用了 **Anthropic Claude Code** 作为编程助手，主要用于：

- 搭建 React / TypeScript / Express / SQLite 项目骨架；
- 实现实验生成器、任务运行时、结果页、研究者后台与 API；
- 调试地图对齐的朝向与正确答案逻辑；
- 编写和运行生成器、API 与端到端测试；
- 整理运行说明、部署说明与文档结构。

使用边界：

- 实验任务、条件、参数、预测方向与提交要求由作者确定并审核；
- AI 没有生成、补造或修改任何参与者数据；
- AI 没有编造文献数值、均值、标准差或显著性结果；
- 当前仓库中的结果部分为空，原因是没有正式数据，而不是用模拟数据填充；
- 提交前对代码、配置和敏感文件进行了人工检查。

如果课程要求更具体的 AI 使用记录，可按时间顺序补充每次 AI 辅助的范围与人工修改内容。

---

## 9. 结果

**待正式数据收集后补充。**

当前状态：

- 尚未进行正式数据收集；
- 仓库中不包含参与者数据、数据库或导出的 CSV / JSON；
- 因此不报告描述统计、推断统计、效应量或组间比较；
- 任何未来结果都应基于正式试次，并按 `PREDICTIONS.md` 中的分析计划报告。

计划补充的内容：

1. 样本量与完成情况（纳入/排除标准、练习完成情况、超时率）；
2. 视觉搜索：各 Block 的正确率、平均/中位正确反应时、集合大小 × 目标存在性描述统计；探索性斜率及其不确定性；
3. 地图对齐：aligned / misaligned 的正确率与正确反应时；无人物线索与人物线索条件；不对齐代价；朝向 × 线索条件的描述性交互；
4. 眼动与鼠标数据质量（若启用），以及明确标注为探索性的派生指标；
5. 与预测一致或不一致的结果，包括没有支持预测的结果。

---

## 10. 讨论

**待补充。**

正式结果产生后，讨论部分应至少覆盖：

- 视觉搜索中特征搜索与联合搜索的差异是否与既有文献方向一致；
- 10 个正式试次是否足以支持稳定的斜率解释，以及探索性斜率的限制；
- 地图对齐效应是否出现，人物线索是否改变不对齐代价；
- 线索条件与朝向的交互是否稳定，是否存在速度—正确率权衡；
- 浏览器计时、样本量、试次数量、设备差异与 WebGazer 质量对结论的限制；
- 与文献比较时只做背景性讨论，不把个人数据与文献均值做显著性检验，不编造可比数值。

---

## 11. 隐私、伦理与已知限制

- 不采集姓名、电话、邮箱、精确位置或原始摄像头视频。
- 课程作业收数平台只接收匿名编号与紧凑行为数据，不接收姓名、学号、联系方式、原始眼动/鼠标样本或摄像头画面。
- 摄像头只在视觉搜索实验中被试单独同意后开启；注视估计在浏览器本地完成，原始视频不上传。
- 拒绝摄像头不会影响实验完成；记录 `eye_tracking_status = declined`。
- 不把鼠标轨迹称为眼动；不伪造眼动指标；WebGazer 指标明确标注为探索性估计。
- 浏览器无法保证毫秒级刺激呈现；需要单帧精度的研究应使用实验室设备并做呈现验证。
- 视觉搜索与地图对齐依赖实体键盘（F/J 或方向键），建议在桌面或笔记本上完成。
- SQLite 适合单实例部署；多副本横向扩展需要共享数据库与并发写入设计。
- 离线队列依赖同一浏览器的本地存储；清除站点数据会丢失尚未上传的试次。
- 地图实验的正式试次中没有“前方”正确答案，这是由“目标建筑不等于当前面朝建筑”的平衡规则决定的，不应解释为任务遗漏。

---

## 12. 资产与第三方许可

字体、图标、程序化插画、WebGazer 与主要依赖的来源和授权记录见 **[ASSET_LICENSES.md](./ASSET_LICENSES.md)**。

WebGazer 以未修改的静态文件形式放在 `public/vendor/webgazer/`，其 GPL-3.0-or-later 许可文本随目录提供。若再分发构建产物，请保留相应许可与来源说明。

---

## 13. 提交说明

- 本目录是从独立开发项目复制到课程仓库的代码快照，不包含独立项目的 `.git` 历史。
- 课程仓库中原有的 `作业1-sdt-lab/` 未被修改或删除。
- 代码、配置、测试与文档的提交顺序：
  1. 作业 2 代码、配置与 README；
  2. 正式数据收集前的实验预测 `PREDICTIONS.md`（独立提交）。
- 未上传 `node_modules/`、数据库、参与者数据、`.env`、密钥、日志或测试产物。
- 未执行 Railway 部署；在线地址为已有生产站点。
