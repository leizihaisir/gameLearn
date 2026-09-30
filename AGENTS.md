# AGENTS.md — gameLearn

TypeScript 俄罗斯方块。刻意保持零运行时依赖。

- 上手命令与目录总览看 [README.md](./README.md)
- 规则规格、架构决策、SRS 踢墙表看 [DESIGN.md](./DESIGN.md)

**本文件只写「动手前必须知道、否则会踩坑」的内容，不重复上面两份。**

---

## 一、铁律：`src/game/**` 不含 DOM

`src/game/` 是纯逻辑核心，**禁止**出现 `document`、`window`、`canvas`、`localStorage`。
状态变更只有唯一入口：

```ts
reduce(state: GameState, action: Action): GameState
```

它是纯函数：不读时钟、不碰 DOM、无副作用。随机性来自 `state.rngState`，
所以「初始种子 + 动作序列」完全决定结果 —— 整局游戏能在 node 里跑完。

只有外壳（`main.ts` / `render/` / `input/` / `ui/` / `audio/` / `storage.ts`）
才允许接触浏览器 API。

破坏这条约束会同时废掉 `game.test.ts` 和 `boot.test.ts`，这不是风格偏好，是测试的前提。

## 二、命令

```bash
pnpm dev        # 开发服务器 :5173
pnpm test       # vitest：87 个测试 / 8 个文件
pnpm typecheck  # tsc --noEmit
pnpm build      # typecheck + 生产构建 → dist/
```

改完代码至少跑 `pnpm typecheck && pnpm test`。**没跑过就不要说「应该没问题」。**

### 环境坑（必读）

**1. DSH 的 `workspace-write` 沙箱下 pwsh 起不来**，报 exit 3221225794
（STATUS_DLL_INIT_FAILED）。执行任何命令都需要申请 `danger-full-access`；
读写文件不受影响。不要换个写法反复重试同一条命令。

**2. pnpm 11 会在 esbuild 的安装脚本上退出 1**，进而让 `pnpm run` / `pnpm exec`
**全部连带失败**（不是只有 install 失败）。修法已经写进
[pnpm-workspace.yaml](./pnpm-workspace.yaml)：

```yaml
allowBuilds:
  esbuild: true
```

pnpm 11 读的是这个文件，**不是** `package.json` 里的 `pnpm` 字段（那已被忽略并告警）。
删掉它，`pnpm dev` 会直接报 `ERR_PNPM_IGNORED_BUILDS`。

## 三、改游戏规则的落点

所有可调参数集中在 [src/game/constants.ts](./src/game/constants.ts)，
不要在别处写魔数：

| 想改什么 | 改哪里 |
|---|---|
| 场地尺寸、隐藏缓冲行 | `BOARD_W` / `BOARD_H` / `BUFFER_H` |
| 手感 | `DAS_MS` 133 / `ARR_MS` 33 / `LOCK_DELAY_MS` 500 / `MAX_LOCK_RESETS` 15 |
| 计分 | `LINE_SCORES` / `TSPIN_SCORES` / `PERFECT_CLEAR_BONUS` / `BACK_TO_BACK_MULTIPLIER` / `COMBO_SCORE` |
| 等级曲线 | `LINES_PER_LEVEL` / `MAX_LEVEL`，公式在 [gravity.ts](./src/game/gravity.ts) |
| 键位 | [src/input/keymap.ts](./src/input/keymap.ts) 的 `DEFAULT_KEYMAP` |

**手感参数从未真机验证过** —— 只验过时序逻辑，没人实际玩过。
调整 DAS/ARR/锁定延迟后必须让人试玩，单元测试证明不了「跟手」。

## 四、两个易错点

### 1. SRS 踢墙表的 y 轴方向

[tetromino.ts](./src/game/tetromino.ts) 里的 `JLSTZ_KICKS` / `I_KICKS` 沿用官方约定
**y 向上为正**，而屏幕坐标 y 向下为正。使用时**必须取反**：

```ts
const ny = active.y - kdyUp;   // 注意是减号
```

写反了不会报任何错，只会让贴地旋转往地下钻。`rotation.test.ts` 里有一条
「贴地旋转会向上踢一格（验证 y 轴取反）」专门守着它，别删。

### 2. 不要手抄 28 个旋转矩阵

4 个旋转态由出生态矩阵用公式推导，n×n 包围盒顺时针 `(x, y) → (n - 1 - y, x)`。
SRS 官方定义的各态**恰好等于**这个结果，已逐块核对过。

加新方块只需往 `SPAWN_MATRICES` 里加一个出生态矩阵，旋转态自动生成。

## 五、测试约定

`tests/` 下 8 个文件，全部跑在 node 环境（`environment: 'node'`），**不用 jsdom**：

- **纯逻辑**：直接调 `reduce`。构造状态用 `{ ...createState(seed), phase: 'playing', ... }` 覆盖字段。
- **渲染层**：用假 ctx 计数（[render.test.ts](./tests/render.test.ts)），
  因为 `draw.ts` 只调用 ctx 的方法，不读 DOM。
- **启动冒烟**：[boot.test.ts](./tests/boot.test.ts) 手搓最小 DOM 桩后 `await import('../src/main')`。
  它覆盖的是「应用能不能起来」，类型检查和打包都发现不了 `querySelector` 选错元素这类问题。

新增行为要同时加测试。

**断言写错就改断言，不要为了让测试过而改实现。** 本项目踩过这个坑：
上一轮 4 个失败用例里，3 个其实是我的断言写错了，只有 1 个是真 bug
（`releaseAll` 清空队列的顺序错了，导致失焦后软降卡在开启状态）。

## 六、代码约定

- 注释和提交信息用**中文**，讲「为什么」，不要罗列「改了什么」。
- `strict: true`，另有 `noUnusedLocals` / `noUnusedParameters` /
  `noFallthroughCasesInSwitch` / `noImplicitOverride`。**未使用的导入会直接编译失败。**
- 不要引入框架（React / Vue）。渲染是 Canvas 2D 整屏重绘，200 格毫无压力，
  分层和脏矩形都是过度工程。
- 不要顺手加抽象层、工具函数或新依赖。**本项目刻意保持零运行时依赖**，
  唯一的 dependencies 是空的，三个 devDependencies 是 typescript / vite / vitest。

## 七、提交前

```bash
pnpm typecheck && pnpm test && pnpm build
```

三条全绿再提交。

- 行尾由 [.gitattributes](./.gitattributes) 固定为 LF，不要改
- `dist/`、`node_modules/`、`.idea/` 已在 [.gitignore](./.gitignore) 中忽略
- 仓库：https://github.com/leizihaisir/gameLearn ，主分支 `main`
