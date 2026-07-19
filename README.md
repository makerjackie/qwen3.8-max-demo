# Qwen 3.8 Max Preview — Interactive Science Experiences Demo

> **在线体验：https://makerjackie.github.io/qwen3.8-max-demo/**

10 个交互式科学可视化体验，由 Qwen 3.8 Max Preview 为 [Shape of the World](https://shapeof.world) 平台构建。

## 体验列表

| # | World ID | 标题 | 学科 | 核心算法 |
|---|----------|------|------|----------|
| 1 | `magnetic-lines` | 磁力线长什么样？ | 物理 | 偶极子场 + 铁屑粒子 + RK4 磁力线追踪 |
| 2 | `lightning-lab` | 闪电为什么是锯齿形的？ | 地球·气候 | 中点位移分形 + 随机分叉 |
| 3 | `pendulum-wave` | 摆球为什么会织出彩虹波浪？ | 物理 | 耦合摆阵列 + 频率梯度 |
| 4 | `sandpile` | 一粒沙如何引发雪崩？ | 计算机 | 阿贝尔沙堆模型（自组织临界） |
| 5 | `firefly-sync` | 萤火虫为什么能同时闪光？ | 生物 | Kuramoto 耦合振子模型 |
| 6 | `molecular-vibration` | 分子为什么只在特定频率振动？ | 化学 | 简正模式分析 + 特征向量 |
| 7 | `voronoi-fracture` | 玻璃裂纹为什么是这个形状？ | 数学 | Voronoi 图 + 刚体物理碎裂 |
| 8 | `spirograph` | 齿轮一转，万花绽放 | 数学 | 内摆线/外摆线参数方程 |
| 9 | `dendritic-crystal` | 雪花为什么长成树枝状？ | 化学·材料 | 扩散限制聚集（DLA）+ 6 重对称 |
| 10 | `fourier-epicycles` | 任何曲线都能用旋转圆环画出？ | 数学·信号 | 离散傅里叶变换 + 圆环叠加 |

## 技术栈

- React 19 + TypeScript
- Canvas 2D（60fps requestAnimationFrame）
- Vite 构建
- Phosphor Icons

## 项目结构

```
src/components/experiences/
├── MagneticLines.tsx        # 磁力线沙盒
├── LightningLab.tsx         # 闪电分形实验室
├── PendulumWave.tsx         # 摆球彩虹波
├── Sandpile.tsx             # 阿贝尔沙堆
├── FireflySync.tsx          # 萤火虫同步
├── MolecularVibration.tsx   # 分子简正振动
├── VoronoiFracture.tsx      # Voronoi 彩窗碎裂
├── Spirograph.tsx           # 万花尺
├── DendriticCrystal.tsx     # 枝晶雪花生长
├── FourierEpicycles.tsx     # 傅里叶圆环描线
└── styles/                  # 各体验独立 CSS
```

## 独立运行

这些组件原本运行在 [Shape of the World](https://shapeof.world) 平台中，依赖 `ExperienceControls`、`useExperienceI18n()`、`GuideTour` / `GhostHint` 等平台接口。本仓库通过轻量 mock shim 实现了完全独立运行，无需平台环境。

## 本地开发

```bash
npm install
npm run dev      # 启动 Vite 开发服务器
npm run build    # 生产构建
```

## 部署

已配置 GitHub Actions 自动部署到 GitHub Pages。每次 push 到 `main` 分支即自动构建并发布到 https://makerjackie.github.io/qwen3.8-max-demo/ 。

## 制作记录

- 初始原型：Qwen 3.8 Max Preview（`qwen-3.8-max-preview`）
- 平台：Shape of the World（世界的形状）
- 构建时间：2026-07
