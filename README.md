# 俄罗斯方块 · TypeScript

一个规则对齐官方 Guideline 的俄罗斯方块：SRS 旋转与踢墙、7-bag 随机器、
锁定延迟、DAS/ARR、T-Spin 与 Back-to-Back 计分。核心逻辑是纯函数，
不依赖 DOM，可以脱离浏览器整局测试。

设计文档见 [DESIGN.md](./DESIGN.md)。

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

其他命令：

```bash
pnpm test       # 单元测试（vitest）
pnpm typecheck  # 类型检查
pnpm build      # 类型检查 + 生产构建，产物在 dist/
pnpm preview    # 预览构建产物
```

## 操作

| 按键 | 作用 |
|---|---|
| `←` `→` | 左右移动（含 DAS/ARR 连发） |
| `↓` | 软降 |
| `Space` | 硬降（立即锁定） |
| `↑` / `X` | 顺时针旋转 |
| `Z` / `Ctrl` | 逆时针旋转 |
| `A` | 180° 旋转 |
| `C` / `Shift` | 暂存（Hold），每个方块限一次 |
| `P` / `Esc` | 暂停 |
| `Enter` | 开始 / 结束后重开 |
| `R` | 重新开始 |

点击场地也可以开始或暂停。

## 结构

```
src/
├─ game/       纯逻辑核心，禁止出现 DOM
│  ├─ types.ts        全部核心类型
│  ├─ constants.ts    尺寸、计时、计分表
│  ├─ tetromino.ts    方块形状 + SRS 踢墙表
│  ├─ bag.ts          7-bag 随机器（纯函数版 mulberry32）
│  ├─ board.ts        碰撞 / 落定 / 消行
│  ├─ gravity.ts      等级 → 下落速度
│  ├─ scoring.ts      计分、连击、B2B
│  └─ game.ts         createState() + reduce()：唯一状态变更入口
├─ input/      键位映射与 DAS/ARR
├─ render/     Canvas 绘制
├─ ui/         HUD 与遮罩
├─ audio/      WebAudio 合成音效
├─ storage.ts  最高分持久化
└─ main.ts     装配 rAF 循环
```

**关键约束**：`src/game/**` 里不允许出现 `document`、`window`、`canvas`。
状态变更全部经由 `reduce(state, action)` 这个纯函数，随机性来自 `state.rngState`，
所以「初始种子 + 动作序列」完全决定结果 —— 任何一局都能复现。

## 测试

```bash
pnpm test
```

| 文件 | 覆盖 |
|---|---|
| `rotation.test.ts` | 方块形状推导、SRS 踢墙表数据、贴墙与贴地旋转落点 |
| `board.test.ts` | 碰撞边界、消行后行位移、下落距离 |
| `scoring.test.ts` | 计分表、B2B、连击、等级、重力曲线 |
| `bag.test.ts` | 7-bag 完整性、同种子可复现 |
| `game.test.ts` | 开局、锁定延迟、帧率无关的重力、Tetris + 完美消除、Hold、暂停、游戏结束、确定性 |
| `input.test.ts` | DAS/ARR 时序、系统自动重复抑制、失焦处理 |
| `render.test.ts` | 绘制路径不抛异常，且画的格子数量正确 |
| `boot.test.ts` | 在最小 DOM 桩上真正启动一次应用 |
