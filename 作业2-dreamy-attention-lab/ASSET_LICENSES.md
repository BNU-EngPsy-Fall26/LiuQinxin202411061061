# 资产与第三方授权

本文件记录平台中实际使用的视觉资产、字体、图标与主要第三方依赖的来源和授权。没有使用未标明的第三方图片素材，也没有在运行时请求第三方字体 CDN。

## 程序化视觉资产（本项目原创）

以下内容由本项目代码绘制或生成，不包含第三方图像素材：

- `src/components/layout/DreamBackground.tsx` — 光层、轨道线、雾面光斑与卫星点。
- `src/components/experiments/ExperimentArt.tsx` — 三项实验的实验卡插画（字母阵列、矩形、地图圆盘）。
- `src/experiments/map-alignment/MapScene.tsx` — 地图刺激：圆形裁剪、河流、道路、建筑、树木、目标标记、指南针、人物标记。
- `src/experiments/instructions/ExampleStimuli.tsx` — 说明页示例刺激。
- `src/components/brand/Logo.tsx`、`public/assets/icons/favicon.svg` — 品牌标识与站点图标。
- 所有 CSS 渐变、玻璃质感、光晕、颗粒层与布局图形。

授权：随本项目代码使用。若需再分发，请保留项目中的来源说明。

## 字体

字体通过 Fontsource npm 包本地打包，不使用 Google Fonts 或 Bunny Fonts 运行时请求。

| 字体 | 包 | 版本 | 授权 |
| --- | --- | --- | --- |
| Cormorant Garamond Variable | `@fontsource-variable/cormorant-garamond` | 5.3.0 | SIL Open Font License 1.1 |
| Manrope Variable | `@fontsource-variable/manrope` | 5.3.0 | SIL Open Font License 1.1 |
| Noto Serif SC Variable | `@fontsource-variable/noto-serif-sc` | 5.3.1 | SIL Open Font License 1.1 |

OFL 允许嵌入、使用与再分发；如修改字体文件并以字体形式再分发，需遵循 OFL 的保留名称与版权声明要求。完整许可文本随各 npm 包提供。

## 图标

| 资产 | 包 | 版本 | 授权 |
| --- | --- | --- | --- |
| Lucide 图标集（React 组件） | `lucide-react` | 0.548.0 | ISC License |

图标以 React 组件形式按需引入，未单独复制或修改图标源文件。

## UI 与运行时依赖

| 依赖 | 版本 | 授权 | 用途 |
| --- | --- | --- | --- |
| React / React DOM | 19.2.0 | MIT | UI 运行时 |
| React Router DOM | 7.9.4 | MIT | 路由 |
| Radix UI Primitives（Dialog / Progress / Tabs / Tooltip） | 1.x | MIT | 无障碍交互原语 |
| Tailwind CSS | 3.4.18 | MIT | 工具类与构建 |
| clsx / tailwind-merge | 2.1.1 / 3.3.1 | MIT | 类名组合 |
| Lucide React | 0.548.0 | ISC | 图标 |
| Express | 5.1.0 | MIT | API 服务 |
| Zod | 4.1.12 | MIT | 输入验证 |
| Helmet | 8.1.0 | MIT | HTTP 安全头 |
| express-rate-limit | 8.1.0 | MIT | 登录与 API 限流 |
| cookie-parser | 1.4.7 | MIT | Cookie 解析 |
| compression | 1.8.1 | MIT | 响应压缩 |
| dotenv | 17.2.3 | BSD-2-Clause | 环境变量加载 |
| Vite | 7.1.10 | MIT | 前端构建 |
| TypeScript | 5.9.3 | Apache-2.0 | 类型系统 |
| Vitest | 3.2.4 | MIT | 单元/API 测试 |
| Playwright Test | 1.56.1 | Apache-2.0 | 端到端测试 |
| WebGazer.js | 3.5.3 | GPL-3.0-or-later | 浏览器端摄像头注视估计（本地运行） |
| MediaPipe Face Mesh（随 WebGazer 分发） | 随 WebGazer 3.5.3 | Apache-2.0（模型/运行时代码以随附说明为准） | 面部关键点检测 |

WebGazer 以未修改的静态文件形式放在 `public/vendor/webgazer/`，许可文本见 `public/vendor/webgazer/LICENSE-webgazer.md`。它不参与服务端构建，也不向第三方上传视频。若再分发本项目的构建产物，请同时保留 WebGazer 的 GPL 许可与来源说明，并确认你的部署方式满足 GPL-3.0-or-later 的要求。

版本以 `package-lock.json` 为准。依赖的完整许可证文本位于 `node_modules/<package>/LICENSE*`。

## 未使用的素材

本项目**没有**使用 Unsplash、unDraw、Haikei 或其他图库中的图片；也没有使用第三方 Lottie、视频、3D 模型或音频素材。若后续加入，应在使用前把来源、作者、许可与修改说明追加到本文件。

## 数据与隐私相关说明

平台生成的实验数据属于研究数据，不是第三方资产。数据授权、保存期限与撤回流程应由部署该平台的实验室根据其伦理审查与机构政策确定；平台本身只提供匿名编号、研究用途记录与导出能力。
