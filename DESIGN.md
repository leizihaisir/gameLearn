# TypeScript 俄罗斯方块 — 设计文档

> 版本 v1 · 目标：一个手感正确、逻辑可测、渲染与规则解耦的现代俄罗斯方块。

---

## 1. 目标与范围

**做**：
- 标准 10×20 场地，官方 Guideline 规则（SRS 旋转、7-bag 随机、锁定延迟、DAS/ARR）
- 现代进阶玩法：Hold、Next 预览队列、幽灵方块（Ghost）
- 计分 / 等级 / 消行统计、暂定、重开、最高分本地持久化
- 核心逻辑纯函数化，配单元测试

**不做（v1 明确排除）**：
- 联机对战、排行榜后端
- 手机触屏手势（预留输入层接口，v2 再接）
- 花式皮肤 / 主题市场

---

## 2. 技术选型

| 决策点 | 选择 | 理由 |
|---|---|---|
| 构建工具 | **Vite** | 冷启动快，`vite build` 直接产出静态文件，零配置支持 TS |
| 语言 | **TypeScript**（`strict: true`） | 用联合类型把方块/状态收敛成不可非法表示的类型 |
| 渲染 | **Canvas 2D** | 逐格绘制、`devicePixelRatio` 缩放、整屏重绘 60fps 毫无压力；DOM 方案在动画与像素对齐上会持续别扭 |
| 框架 | **无（原生 TS）** | 游戏生命周期由 rAF 循环驱动，React 的 diff 帮不上忙还会引入状态同步问题 |
| 包管理 | **pnpm** | 快、省磁盘 |
| 测试 | **Vitest** | 与 Vite 共用配置，零额外构建 |
| 状态管理 | **纯 reducer + 不可变状态** | 逻辑可测、可回放、易调试 |

> 这四项是本设计里最值得你确认的地方，理由见下节「架构」。

---

## 3. 目录结构

```
gameLearn/
├─ index.html               # canvas 容器 + HUD 骨架
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.ts               # 入口：装配 rAF 循环 / 输入 / 渲染
   ├─ game/                 # ── 纯逻辑核心，不 import 任何 DOM ──
   │  ├─ types.ts           # 全部核心类型
   │  ├─ constants.ts       # 尺寸、计时、计分表等可调参数
   │  ├─ tetromino.ts       # 7 种方块形状 + SRS 旋转 + 踢墙表
   │  ├─ bag.ts             # 7-bag 随机器
   │  ├─ board.ts           # 碰撞 / 落定 / 消行
   │  ├─ scoring.ts         # 计分、连击、T-spin 判定
   │  ├─ gravity.ts         # 等级 → 下落速度
   │  └─ game.ts            # createState() + reduce()：唯一的状态变更入口
   ├─ input/
   │  ├─ keymap.ts          # 键位映射（可配置）
   │  └─ controller.ts      # DAS / ARR 自动重复
   ├─ render/
   │  ├─ canvas.ts          # DPR 适配、画布尺寸计算
   │  ├─ draw.ts            # 场地 / 方块 / 幽灵 / 预览 绘制
   │  └─ theme.ts           # 配色常量
   ├─ ui/
   │  ├─ hud.ts             # 分数 / 等级 / 行数 / Next / Hold 文本
   │  └─ overlay.ts         # READY / PAUSED / GAME OVER 遮罩
   ├─ audio/
   │  └─ sfx.ts             # WebAudio 合成音效（无音频资源文件）
   └─ storage.ts            # localStorage：最高分、键位设置
tests/
   ├─ board.test.ts
   ├─ rotation.test.ts      # 形状推导 + 踢墙表逐条验证
   ├─ scoring.test.ts       # 计分表 / 等级 / 重力曲线
   ├─ bag.test.ts           # 7-bag 完整性与可复现性
   ├─ game.test.ts          # reducer 集成
   ├─ input.test.ts         # DAS / ARR 时序
   ├─ render.test.ts        # 绘制路径冒烟
   └─ boot.test.ts          # 启动冒烟
```

**关键约束**：`src/game/**` 里禁止出现 `document`、`window`、`canvas`。这条铁律换来的是「测试里跑一局完整游戏」的能力 —— 不需要浏览器环境。

---

## 4. 核心数据模型

```ts
// ---- 方块 ----
export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Rotation = 0 | 1 | 2 | 3;

/** 场地格子：0 = 空，其余为方块 id 的编码 */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ActivePiece {
  readonly id: PieceId;
  readonly rotation: Rotation;
  readonly x: number;   // 包围盒左上角所在列
  readonly y: number;   // 包围盒左上角所在行（可为负，表示在缓冲行上方）
}

// ---- 场地 ----
export const BOARD_W = 10;
export const BOARD_H = 20;   // 可见高度
export const BUFFER_H = 2;   // 顶部隐藏缓冲行

export interface Board {
  readonly grid: Uint8Array;  // 长度 (BOARD_H + BUFFER_H) * BOARD_W，行优先
}

// ---- 全局状态 ----
export type Phase = 'ready' | 'playing' | 'paused' | 'gameOver';

export interface GameState {
  readonly phase: Phase;
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly holdSlot: PieceId | null;
  readonly holdUsedThisPiece: boolean;
  readonly queue: readonly PieceId[];   // 至少保证 7 个可用
  readonly bag: readonly PieceId[];     // 7-bag 剩余
  readonly rngSeed: number;             // 可复现随机
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly combo: number;
  readonly backToBack: boolean;
  // 计时（毫秒）
  readonly gravityAccumulator: number;
  readonly lockTimer: number;
  readonly lockResets: number;
  readonly isGrounded: boolean;
  /** 本帧产生的事件，供渲染/音效消费后清空 */
  readonly events: readonly GameEvent[];
}

export type GameEvent =
  | { type: 'PieceMoved' } | { type: 'PieceRotated' } | { type: 'PieceLocked' }
  | { type: 'LinesCleared'; count: number; rows: number[]; tspin: TSpinKind }
  | { type: 'LevelUp'; level: number }
  | { type: 'Hold' } | { type: 'HardDrop'; distance: number }
  | { type: 'TopOut' };
```

**为什么用 `Uint8Array` 存场地**：消行是「整行搬移」操作，typed array 的 `copyWithin` 能原地搬，比 `number[][]` 的数组分配快且不产生垃圾。

**为什么用 `events` 数组**：纯函数不能有副作用，但音效和粒子动画需要知道「刚刚发生了什么」。把事件挂在状态上、由外壳消费后清空，是纯函数与副作用之间最省事的桥。

---

## 5. 规则规格

### 5.1 方块形状与 SRS 旋转

只定义 **4 个出生矩阵**（SRS 标准朝向），其余 3 个旋转态由矩阵旋转**算出来**：

```ts
// 3×3 包围盒顺时针：(x, y) → (2 - y, x)
// 4×4（I）：      (x, y) → (3 - y, x)
```

这**不是**近似 —— SRS 官方定义的各旋转态恰好就是出生态在对应包围盒内的旋转结果。已逐块核对：T 的 R 态得到 `(2,1),(1,0),(1,1),(1,2)`，与 SRS 表一致；I 的 R 态得到第 2 列竖条，也一致。

出生矩阵（`X` = 实心）：

```
I (4×4)        O (2×2)      J            L            S            T            Z
. . . .        X X          X . .        . . X        . X X        . X .        X X .
X X X X        X X          X X X        X X X        X X .        X X X        . X X
. . . .                     . . .        . . .        . . .        . . .        . . .
. . . .
```

**出生位置**：3×3 方块 `x = 3, y = 0`；I 为 `x = 3, y = 0`；O 为 `x = 4, y = 0`。配合 2 行隐藏缓冲，方块实心格落在内部第 1~2 行，玩家看不到「凭空出现」。

### 5.2 踢墙表（Wall Kick）

旋转被阻挡时，依次尝试偏移量，第一个不碰撞的位置生效。

**注意符号约定**：下表沿用 SRS 官方约定，**y 轴向上为正**。而屏幕坐标 y 向下为正，所以实现时必须**对 y 取反**。这是本项目最容易写错的一处，务必配单元测试。

**J / L / S / T / Z**：

| 0→1 | 1→0 | 1→2 | 2→1 |
|---|---|---|---|
| (0,0) | (0,0) | (0,0) | (0,0) |
| (-1,0) | (+1,0) | (+1,0) | (-1,0) |
| (-1,+1) | (+1,-1) | (+1,-1) | (-1,+1) |
| (0,-2) | (0,+2) | (0,+2) | (0,-2) |
| (-1,-2) | (+1,+2) | (+1,+2) | (-1,-2) |

| 2→3 | 3→2 | 3→0 | 0→3 |
|---|---|---|---|
| (0,0) | (0,0) | (0,0) | (0,0) |
| (+1,0) | (-1,0) | (-1,0) | (+1,0) |
| (+1,+1) | (-1,-1) | (-1,-1) | (+1,+1) |
| (0,-2) | (0,+2) | (0,+2) | (0,-2) |
| (+1,-2) | (-1,+2) | (-1,+2) | (+1,-2) |

**I**（偏移量更大）：

| 0→1 | 1→0 | 1→2 | 2→1 |
|---|---|---|---|
| (0,0) | (0,0) | (0,0) | (0,0) |
| (-2,0) | (+2,0) | (-1,0) | (+1,0) |
| (+1,0) | (-1,0) | (+2,0) | (-2,0) |
| (-2,-1) | (+2,+1) | (-1,+2) | (+1,-2) |
| (+1,+2) | (-1,-2) | (+2,-1) | (-2,+1) |

| 2→3 | 3→2 | 3→0 | 0→3 |
|---|---|---|---|
| (0,0) | (0,0) | (0,0) | (0,0) |
| (+2,0) | (-2,0) | (+1,0) | (-1,0) |
| (-1,0) | (+1,0) | (-2,0) | (+2,0) |
| (+2,+1) | (-2,-1) | (+1,-2) | (-1,+2) |
| (-1,-2) | (+1,+2) | (-2,+1) | (+2,-1) |

**O 方块**：4 个旋转态形状完全相同，但**仍要占位旋转计数**；踢墙表为空（只尝试 `(0,0)`）。不实现「O 可平移旋转」这种非标准行为。

**180° 旋转**：非 SRS 标准，v1 作为可选键位实现，仅尝试 `(0,0)` 与 `(0,-1)/(0,+1)`。

### 5.3 随机器：7-bag

把 7 种方块打乱成一袋，依次发完再开新袋。保证任意连续 7 个方块中每种恰好出现一次，消除长串同形状。

用**可播种的 PRNG**（如 mulberry32），把种子放进状态 —— 这样任何一局都能凭种子完整复现，测试和 bug 复现都受益。

队列始终补足到 ≥ 7 个，供 Next 预览 5 个 + 当前 1 个使用。

### 5.4 计分

| 项目 | 分数 |
|---|---|
| Single / Double / Triple / Tetris | 100 / 300 / 500 / 800 |
| T-Spin Mini | 100 |
| T-Spin Single / Double / Triple | 800 / 1200 / 1600 |
| Back-to-Back（连续高难消行） | ×1.5 |
| Combo | 50 × combo 数 |
| Soft Drop | 1 / 格 |
| Hard Drop | 2 / 格 |
| Perfect Clear | +1000 ~ +3000（按消行数） |

除 Soft/Hard Drop 外，均再 **× 当前等级**。

**T-Spin 判定**（三角法则）：落定的是 T 方块、且本次落定由旋转触发、且 T 的中心四角中有 **≥3 个**被墙或已固定方块占据 → T-Spin。若「朝向前方」的两角未同时占据，判为 Mini。

### 5.5 等级与下落速度

每消 10 行升 1 级。下落速度用官方公式：

```
每格秒数 = (0.8 - (level - 1) × 0.007) ^ (level - 1)
```

| 等级 | 1 | 2 | 3 | 5 | 10 | 15 |
|---|---|---|---|---|---|---|
| 秒/格 | 1.000 | 0.793 | 0.618 | 0.355 | 0.064 | 0.007 |

**等级上限取 15**：到 15 级时已是每格约 7ms，实际等同于瞬时下落，再往上没有可玩性。
达上限后只继续加分。

### 5.6 锁定延迟与地面状态

- 方块触底后不立即锁定，给 **500ms** 缓冲让玩家微调。
- 玩家每成功移动/旋转一次，锁定计时器**重置**，但最多重置 **15 次**（防止无限拖延）。
- 完全无操作地触底 → 计时归零即锁定。
- Hard Drop → 立即锁定，不走延迟。

### 5.7 输入手感

| 参数 | 值 | 说明 |
|---|---|---|
| DAS（首次延迟） | 133ms | 按住左右后，多久开始连发 |
| ARR（连发间隔） | 33ms | 连发速度，≈ 每 2 帧一格 |
| Soft Drop 倍率 | 20× 重力 | 按下即快速下落，松开恢复 |

**DAS/ARR 必须在输入层实现，不能在游戏逻辑层**。逻辑层收到的是离散的「向左移动一格」动作；「按住多久触发第几格」是设备层的重复策略。分开后，键盘、触屏、AI 都能复用同一套核心。

### 5.8 游戏结束

- **Block Out**：新方块出生位置就与已有方块重叠。
- **Lock Out**：方块落定后完全位于隐藏缓冲行内。
- 两者任一触发 → `phase = 'gameOver'`。

---

## 6. 架构：纯核心 + 命令外壳

这是整个设计的主心骨。

```ts
// game/game.ts —— 唯一的对外接口
export function createState(seed: number): GameState;
export function reduce(state: GameState, action: Action): GameState;

export type Action =
  | { type: 'Start' } | { type: 'Pause' } | { type: 'Resume' } | { type: 'Restart'; seed: number }
  | { type: 'MoveLeft' } | { type: 'MoveRight' }
  | { type: 'RotateCW' } | { type: 'RotateCCW' } | { type: 'Rotate180' }
  | { type: 'SoftDropStart' } | { type: 'SoftDropEnd' }
  | { type: 'HardDrop' } | { type: 'Hold' }
  | { type: 'Tick'; dt: number };
```

外壳（`main.ts`）的职责就三件事：

```ts
let state = createState(seed);

function frame(now: number) {
  const dt = now - last; last = now;

  // 1. 消费输入队列 → 派发语义动作（移动/旋转立即响应，不等下一帧）
  for (const action of controller.drain(now)) state = reduce(state, action);

  // 2. 推进时间（重力、锁定延迟）
  state = reduce(state, { type: 'Tick', dt });

  // 3. 渲染 + 播放事件音效，然后清事件
  draw(ctx, state);
  sfx.consume(state.events);
  state = { ...state, events: [] };

  requestAnimationFrame(frame);
}
```

**为什么不用「每帧固定 +1 格」的重力**：那样下落速度会被帧率绑架，120Hz 屏幕上快一倍。时间累加器把重力和帧率彻底解耦。

**为什么移动/旋转要立即派发而不是攒到下一帧**：输入延迟每多 1 帧手感就差一档。左右移动必须在 keydown 当帧生效。

---

## 7. 渲染方案

- **主场地**：一个 canvas，逻辑尺寸 `10 × 20` 格，`CELL = 30px` → `300 × 600`。按 `devicePixelRatio` 放缩 canvas 的 `width/height` 属性并用 CSS 固定显示尺寸，消除高分屏模糊。
- **整屏重绘**：每帧 `clearRect` 后全画一遍。10×20 = 200 格，这个量级下分层/脏矩形优化纯属过度工程。
- **幽灵方块**：把当前方块沿列向下探到最底，用半透明描边绘制，让玩家预判落点。
- **Next / Hold**：独立小 canvas 或直接在主 canvas 右侧留边距绘制。独立画布更简单。
- **布局**：flex 横向排布 `[Hold] [主场地] [Next + HUD]`，整体用 CSS 缩放适配窗口。
- **方块外观**：填充主色 + 亮色内高光 + 深色边框，形成立体感。颜色集中在 `theme.ts`，换肤只改一处。

---

## 8. 测试策略

核心逻辑纯函数化之后，测试写起来几乎没有成本：

| 测试文件 | 覆盖内容 |
|---|---|
| `rotation.test.ts` | **对每个方块、每个旋转态、每组踢墙偏移，逐条断言**最终落点。这是 bug 重灾区，值得写得最细 |
| `board.test.ts` | 碰撞边界（左右墙、地板、缓冲行）、I 方块贴墙旋转、消行后上方行正确下移、消 4 行的连锁 |
| `scoring.test.ts` | 各级消行分数、Combo 累加、Back-to-Back ×1.5、等级曲线、重力曲线 |
| `bag.test.ts` | 遍历大量袋子，断言每 7 个必为 7 种各一次；同种子结果可复现 |
| `game.test.ts` | 锁定延迟、帧率无关的重力、Tetris + 完美消除、Hold、暂停、游戏结束、整局确定性 |
| `input.test.ts` | DAS/ARR 时序、系统自动重复抑制、失焦释放 |
| `render.test.ts` | 绘制路径不抛异常，且绘制的格子数量正确 |
| `boot.test.ts` | 在最小 DOM 桩上真正启动一次应用，验证装配与第一帧 |

另附一条**黄金用例**：给定种子 + 一串动作，断言最终状态的哈希。以后重构时它能一眼看出行为是否被意外改变。

---

## 9. 里程碑

| # | 内容 | 产出验收 |
|---|---|---|
| **M1** | Vite + TS 骨架，canvas 按 DPR 正确初始化 | 屏幕上出现一个空的 10×20 网格 |
| **M2** | 方块定义、出生、重力下落、左右移动、碰撞 | 方块能下落、能撞墙撞地，位置正确 |
| **M3** | 消行、计分、等级、游戏结束 | 能玩：消行加分、越来越快、堆满结束 |
| **M4** | 7-bag、Next 队列、Hold、幽灵方块 | 预览正确，Hold 每方块限用一次 |
| **M5** | DAS/ARR、锁定延迟、暂停/重开遮罩 | **手感对齐主流实现**，这一步决定成败 |
| **M6** | SRS 完整踢墙、T-Spin 判定与加分 | 贴墙旋转不卡顿，T-Spin 正确识别 |
| **M7** | 音效、消行动画、响应式布局、最高分持久化 | 完成度达到「可以给别人玩」 |
| **M8** | 补齐单元测试、接入 CI | 核心逻辑测试全绿 |

**建议的推进节奏**：M1–M4 一次做完就能得到可玩版本，M5 单独精修（手感需要反复试），M6 是规则正确性的收尾。

---

## 10. 决策记录与实现状态

设计阶段提出的 5 个待定项，按推荐默认值全部落地：

| 事项 | 采用方案 |
|---|---|
| 技术选型 | Vite 6 + TypeScript 5.9 + Canvas 2D，无框架，pnpm |
| 隐藏缓冲行 | 2 行（`INTERNAL_H = 22`，渲染跳过前 2 行） |
| T-Spin / 完美消除 | 完整实现，含三角判定、Mini、B2B、Perfect Clear |
| 音效 | WebAudio 振荡器合成，无素材文件 |
| 视觉风格 | 现代扁平风（深色背景 + 每格高光/阴影做出体积感） |

**实现状态：M1–M8 全部完成。**

- `pnpm typecheck` 通过
- `pnpm test` 全绿
- `pnpm build` 产出 `dist/`（约 17.6 kB JS / 6.8 kB gzip）

尚未做浏览器端的真机手感调试 —— DAS/ARR 与锁定延迟的参数是否顺眼，
需要在真实浏览器里试玩后再微调，这些值都集中在 `src/game/constants.ts`。
