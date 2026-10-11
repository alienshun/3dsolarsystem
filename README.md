# 太阳系模拟器 · Solar System Simulator

浏览器端真实太阳系模拟器：开普勒力学解算 + Three.js 渲染，无游戏引擎依赖。
所有天体位置都是儒略日的纯函数——快进、倒放、跳转到任意日期都无状态漂移。

技术栈：Vite + TypeScript + Three.js（原生 WebGL）

## 功能

- **开普勒管线**：JPL 平均根数（含世纪漂移项）→ 高偏心率稳健求解（牛顿 + 括号二分兜底，支持 e→0.995 的彗星）
- **双比例模式**：观赏模式（半径/距离压缩显示）与真实比例 1:1（km 单位 + 浮动原点对抗 float32 精度）
- **天体阵容**：太阳、八大行星、约 20 颗主要卫星、5 颗矮行星、4 颗彗星、3 颗近地小行星（轨道根数构建期自 JPL sbdb 全精度拉取并打包快照）
- **主小行星带**：4000 颗合成小行星点云，含 Kirkwood 共振间隙
- **真实形状管线**：贝努（glb）、丝川/爱神（stl，构建期 decimate）来自 NASA 3D Resources；火卫一、67P 等无公开网格者按真实轴比程序化生成（撞击坑、双瓣颈部）；远距自动回落低面数代理球
- **广义相对论（深度 A）**：近日点进动解析修正 Δϖ = 6πGM☉/(c²a(1−e²))，可开关（水星 ≈ 43″/世纪）
- **单天体轨道显隐**：导航列表每行行尾 ●/○ 按钮单独隐藏/显示该天体轨道线，与全局「轨道线」开关相与
- **时间控制**：倒放 / 暂停 / 流速 1 秒/秒 → 1 年/秒（对数滑杆）/ 日期跳转 / 回到现在
- **交互**：拖拽旋转、滚轮缩放、右键平移、点击天体看信息卡、双击空白取消跟随

## 快速开始

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（dist/）
npm run preview    # 本地预览生产构建
npm run validate:positions   # 轨道精度与力学自洽校验（纯 node，离线可跑）
```

## 深链

- `?follow=<id>`：进入即跟随指定天体（如 `?follow=pluto`）
- `?true=1`：直接进入真实比例模式（可叠加，如 `?follow=bennu&true=1` 看贝努真实形状）

## 精度校验

`npm run validate:positions` 覆盖：

- 地球 J2000 位置 vs 内嵌 JPL Horizons 参考向量（< 0.004 AU）
- 1850–2050 地球黄经/日距 vs Meeus《天文算法》独立实现（max Δλ < 0.01°）
- 八大行星恒星周期数值测量 vs 公认值（< 0.1%）
- 行星与小天体向径范围 vs a(1±e) 自洽
- GR 进动速率 vs 公认表（水星 42.98″/世纪）
- 高偏心率开普勒求解往返精度（e = 0.9 / 0.99 / 0.995，残差 ~1e-12）

## 目录结构

```
src/
  core/       时间 / 开普勒 / 根数传播 / GR 修正（纯函数）
  data/       行星 / 卫星 / 小天体根数与 sbdb 快照
  render/     场景 / 天体网格 / 轨道线 / 小行星带 / 形状管线 / 标签 / 比例映射
  ui/         控制面板 / 信息卡
scripts/      校验入口、sbdb 拉取、STL decimate
public/
  textures/   真实贴图（2k）
  shapes/     真实形状网格（glb / stl）
```

## 数据来源与致谢

- 轨道根数与物理参数：JPL Solar System Dynamics / NASA NSSDCA
- 贴图：[Solar System Scope](https://www.solarsystemscope.com/textures/)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，源自 NASA/USGS）
- 形状模型：[NASA 3D Resources](https://nasa3d.arc.nasa.gov/)

## License

[MIT](LICENSE)
