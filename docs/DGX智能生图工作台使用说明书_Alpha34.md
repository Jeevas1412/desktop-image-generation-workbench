---
title: DGX智能生图工作台使用说明书（Alpha34）
version: 0.1.1-alpha.34
status: 本机 Alpha 使用说明
updated: 2026-07-22
---

# DGX 智能生图工作台使用说明书（Alpha34）

## 1. 产品是什么

DGX 智能生图工作台是一个 Windows 桌面端控制台，用于把已运行的 ComfyUI 生图服务、可选 VLM 服务，以及本地的提示词、参考图、LoRA、任务记录和半成品素材库放到同一套受控流程中。

它不是模型包，也不会替用户安装或启动 ComfyUI、Python、模型权重、VAE、文本编码器或 LoRA。安装工作台后，用户仍需连接一台已经运行且可访问的 ComfyUI；该设备可以是本机、局域网工作站，或已经通过 VPN/内网网关安全暴露的远端设备。

当前版本为 **`0.1.1-alpha.34` Unsigned Alpha**。已支持真实 ComfyUI 提交、多轮归档、VLM 翻译/审核等实际链路；当前受控 DGX 的三核心真实工作流和 Windows Sandbox 的无旧数据首次安装均已完成验收。GitHub 发布、GitHub Actions 构建来源证明，以及对 GitHub 实际发布安装包的干净 Windows 复验仍未完成。因此它适用于受控环境的功能验证与创作，不应被当作生产发布版。

## 2. 工作流总览

```text
用户填写影视提示词与参数
        ↓
可选：VLM 翻译为英文，用户确认后写入正面提示词
        ↓
连接并只读检查 ComfyUI → 扫描真实模型与队列
        ↓
选择已登记核心、可用 LoRA、参考图和任务轮次
        ↓
逐轮串行提交 ComfyUI（5 轮或 25 轮）
        ↓
下载真实输出 → 写入 PNG 生成参数 → 自动归档到半成品库
        ↓
可选：VLM 审核评分与修改建议 → 用户决定是否继续修改
```

安全边界：工作台不会在启动时自动连接、启动、停止、重启或清空 ComfyUI；只有用户点击相应操作时才会请求固定接口。停止按钮只停止**后续轮次**，不会调用共享 ComfyUI 的全局中断或清队列。

## 3. 开始前准备

### 3.1 必需条件

1. Windows 已安装并启动本工作台。
2. 至少有一台运行中的 ComfyUI，且工作台所在电脑可访问其局域网/回环地址与端口。
3. ComfyUI 中已安装至少一种已登记生图核心及其依赖。
4. 若使用翻译或图片审核，另需准备一个 OpenAI-compatible VLM 服务；VLM 与 ComfyUI 使用独立地址和端口。

### 3.2 获取 ComfyUI 与模型

还没有 ComfyUI 时，先按 [ComfyUI Windows 官方安装说明](https://docs.comfy.org/installation/desktop/windows) 安装，并在安装完成后打开一次，确认界面能正常启动。选择有足够空间的磁盘作为模型目录。

本工作台不自动替你下载模型。请按下表下载你准备使用的核心和依赖，放入相应 ComfyUI 目录；完成后刷新或重启 ComfyUI，再到工作台“模型与下载”页面点击“读取真实状态”。

| 需要的资源 | 获取地址 | 放入 ComfyUI | 仅在选择时需要 |
|---|---|---|---|
| Pony Diffusion V6 XL | [下载主模型](https://hf-mirror.com/LyliaEngine/Pony_Diffusion_V6_XL/resolve/14885f1c01d7723bcbf676773def286c1fd733bc/ponyDiffusionV6XL_v6StartWithThisOne.safetensors) | `models/checkpoints/` | Pony |
| SDXL VAE | [下载 `sdxl_vae.safetensors`](https://hf-mirror.com/LyliaEngine/Pony_Diffusion_V6_XL/resolve/14885f1c01d7723bcbf676773def286c1fd733bc/sdxl_vae.safetensors) | `models/vae/` | Pony 或 Illustrious |
| Illustrious XL v0.1 | [下载主模型](https://hf-mirror.com/OnomaAIResearch/Illustrious-xl-early-release-v0/resolve/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/Illustrious-XL-v0.1.safetensors) | `models/checkpoints/` | Illustrious |
| FLUX.1 Dev Kontext FP8 | [下载主模型](https://hf-mirror.com/Comfy-Org/flux1-kontext-dev_ComfyUI/resolve/c215e51f94373df8914054c98ba67575c0c2b157/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors) | `models/unet/` 或 `models/diffusion_models/` | FLUX |
| FLUX CLIP-L | [下载 `clip_l.safetensors`](https://hf-mirror.com/comfyanonymous/flux_text_encoders/resolve/6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5/clip_l.safetensors) | `models/text_encoders/` | FLUX |
| FLUX T5-XXL FP16 | [下载 `t5xxl_fp16.safetensors`](https://hf-mirror.com/comfyanonymous/flux_text_encoders/resolve/6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5/t5xxl_fp16.safetensors) | `models/text_encoders/` | FLUX |
| FLUX VAE | [下载 `ae.safetensors`](https://hf-mirror.com/black-forest-labs/FLUX.1-dev/resolve/3de623fc3c33e44ffbe2bad470d0f45bccf2eb21/ae.safetensors) | `models/vae/` | FLUX |

下载链接使用 HF-Mirror 作为国内访问镜像。它只提供访问加速；模型许可证、登录要求与使用条件仍以模型上游页面为准。Illustrious 与 FLUX.1 dev 在下载前尤其需要阅读条款。下载完成后不要改名，否则工作台无法识别。

#### 校验下载的模型文件

模型名称相同不代表文件相同。下载或手动导入后，请在存放模型的电脑上核对 SHA-256：Windows 可在本项目目录运行下列命令；返回的 `verified` 必须为 `true` 才表示文件与当前登记版本一致。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-model-file.ps1 `
  -ArtifactId pony.checkpoint `
  -Path "D:\ComfyUI\models\checkpoints\ponyDiffusionV6XL_v6StartWithThisOne.safetensors"
```

Linux/DGX 可执行 `sha256sum /实际模型路径/文件名.safetensors`，再与本节下载表中模型对应的 SHA-256 对照。FLUX 还需分别校验 UNet、VAE、`clip_l` 与 `t5xxl_fp16` 四个文件。工作台会自动检查工作流依赖；文件哈希校验需要在模型所在设备完成，ComfyUI 的只读接口不会提供这一信息。

可选的翻译与图片审核服务（VLM）不是生图的必需条件。需要这两项功能但尚未有 VLM 时，可先从 [Qwen3-VL-8B-Instruct 国内镜像](https://hf-mirror.com/Qwen/Qwen3-VL-8B-Instruct) 获取完整模型文件，再使用支持 OpenAI-compatible 接口的推理服务部署它；部署完成后，在工作台填写该服务给出的地址、端口和接口密钥。仅使用生图时，可以跳过这一步。

### 3.3 工作台不包含的内容

- Pony、Illustrious、FLUX、VAE、CLIP/T5、LoRA 或任何模型权重；
- ComfyUI、Python、CUDA、显卡驱动；
- 用户图片、半成品、提示词、任务历史、连接地址、令牌或 SSH 私钥。

模型及其权重的许可、下载来源与使用条件由使用者自行确认；工作台的 Apache-2.0 许可证不覆盖模型权重。

## 4. 第一次连接 ComfyUI

进入左侧的 **连接 ComfyUI** 页面，先选择 ComfyUI 的实际运行位置。

| 场景 | 应选择 | 地址填写方式 |
|---|---|---|
| ComfyUI 与工作台在同一台电脑 | 这台电脑 | `127.0.0.1` 或 `localhost`，端口填启动信息中的端口 |
| ComfyUI 在局域网另一台电脑/DGX | 局域网另一台电脑 | 填运行 ComfyUI 那台设备的 IP/名称及实际监听端口 |
| 已有 VPN、内网网关或公司私网入口 | 已配置的安全远端 | 填管理员提供的私网地址与端口；本页不建立 SSH 隧道 |
| 尚未安装或未启动 ComfyUI | 尚未安装 ComfyUI | 先完成 ComfyUI 部署和启动，再回来连接 |

`8188` 是许多 ComfyUI 安装的常见端口，不是所有环境的默认事实。应以 ComfyUI 的启动窗口或管理员提供的连接资料为准。

在运行 ComfyUI 的设备上可用下列命令辅助确认信息：

```bash
# DGX / Linux
hostname -I
ps -ef | grep '[m]ain.py'
ss -ltn | grep -E ':(8188|8189|8190)[[:space:]]'
```

```powershell
# Windows（运行 ComfyUI 的那台电脑）
ipconfig
netstat -ano | findstr :8188
netstat -ano | findstr :8189
```

填写后点击 **检查并保存连接**。工作台只会访问固定的只读 `/object_info` 接口验证其是否为 ComfyUI；通过后才保存地址和端口，不保存密码、令牌或 SSH 私钥。

### 可选：连接 VLM

同一页面下方可填写 VLM 地址和端口。点击 **验证并保存 VLM 翻译服务** 后，工作台只读取固定 `/v1/models`。VLM 用于：

- 将中文提示词翻译成英文草稿；
- 对已归档的生成图片给出评分、问题、摘要和英文修改建议。

未配置、不可达或审核失败时，图片仍保留真实 ComfyUI 生成结果；界面会显示未审核原因，不会生成虚构评分。

## 5. 选择生图核心

连接成功后，进入 **模型与下载**，读取真实 ComfyUI 节点、候选模型和队列。只有下列三种已登记核心、且其依赖均被扫描到时，才能保存为工作台生图核心。

| 核心 | 工作台名称与定位 | 适合做什么 | 注意事项 |
|---|---|---|---|
| Pony Diffusion V6 XL | 动画人像 | 动画人物、标签化风格、拟兽/卡通人像 | 场景能力相对有限；优先使用 SDXL LoRA |
| Illustrious XL v0.1 | 动画人像 | 动画人物、插画式角色、人物设计 | 场景能力相对有限；优先使用 SDXL LoRA |
| FLUX.1 Dev Kontext FP8 | 真实通用 | 写实人物、产品、环境、自然语言描述 | 使用 Flux LoRA；需 UNET、VAE、`clip_l` 与 `t5xxl` 完整依赖 |

“已登记工作流”表示文件名、节点资源和工作流依赖符合当前工作台的接线规则；ComfyUI 的只读接口不能提供模型文件 SHA-256，因此这不等于模型权重已经完成密码学完整性验证。

## 6. 生图工作台：推荐操作顺序

进入 **生图工作台** 后，左侧用于输入，右侧用于预览、任务状态和 VLM 意见。页面切换后，文本、参数和影视提示词引导会保存在本机草稿中；参考图文件句柄只在当前应用会话中有效。

推荐顺序：

1. 确认顶部显示 `ComfyUI 可达`，并确认当前生图核心名称。
2. 使用影视提示词引导填写画面要素。
3. 需要中文创作时，先翻译并人工确认英文正面提示词。
4. 按需添加一张参考图和兼容 LoRA。
5. 设置分辨率、步数、CFG、Seed 与轮次。
6. 先用 5 轮试探；确认方向后再使用 25 轮。
7. 在右侧查看每轮输出和 VLM 意见；决定保留、改提示词或把半成品设为下一轮参考图。

### 6.1 影视提示词引导

引导将画面拆为十个字段：

```text
主体 + 动作 + 场景 + 景别 + 视角 + 光线 + 色调 + 镜头/景深 + 构图 + 风格与画质
```

每一类填写一个明确、可见的目标即可，不必堆满术语。填写后可生成中文草稿并追加到正面提示词；它不会强制覆盖已有提示词。

示例：

```text
一名穿黑色风衣的侦探站在雨夜街口，中景，四分之三侧面视角，霓虹侧逆光，冷色低饱和，50mm镜头，浅景深，三分法构图，电影剧照，细节清晰
```

人物需要完整全身时，建议在“景别”或正面提示词中明确写：

```text
全身人物，头到脚完整可见，双腿和双脚完整出现在画面内，镜头后退，人物周围留有空间，竖幅构图
```

#### 影视行业基础提示词速查

按需从每一列选一项写入即可，不要在同一维度堆叠互相矛盾的词。例如已经写了 `close-up`，就不应同时写 `full-body shot`。

| 画面维度 | 中文写法示例 | 可直接使用的英文短语 |
| --- | --- | --- |
| 景别 | 远景、全景、全身、中景、近景、特写 | `wide shot`、`full-body shot`、`medium shot`、`close-up`、`extreme close-up` |
| 视角 | 平视、侧面、四分之三侧面、俯视、仰视、鸟瞰、过肩 | `eye-level view`、`side view`、`three-quarter view`、`high-angle shot`、`low-angle shot`、`bird's-eye view`、`over-the-shoulder shot` |
| 光线 | 柔光、侧逆光、轮廓光、窗光、霓虹灯、体积光 | `soft light`、`side backlighting`、`rim light`、`window light`、`neon lighting`、`volumetric lighting` |
| 色调 | 暖色、冷色、低饱和、高对比、蓝调时刻、青橙电影色调 | `warm color palette`、`cool color palette`、`low saturation`、`high contrast`、`blue hour`、`teal and orange color grading` |
| 镜头与景深 | 24mm 广角、50mm 标准、85mm 人像、浅景深、深景深、散景 | `24mm wide-angle lens`、`50mm lens`、`85mm portrait lens`、`shallow depth of field`、`deep depth of field`、`creamy bokeh` |
| 构图 | 居中、三分法、对称、引导线、前中后景、负空间 | `centered composition`、`rule of thirds`、`symmetrical composition`、`leading lines`、`foreground, midground and background layers`、`negative space` |

人物全身时请明确写：`full-body shot, head-to-toe, both legs and feet fully visible within the frame, camera pulled back, generous space around the subject, vertical composition`。不要只写“全景”，否则模型可能把它理解为环境全景，而不是人物全身。

### 6.2 正面与负面提示词

- **正面提示词**为必填；实际提交给模型时应使用英文。中文可先通过已配置 VLM 生成英文草稿，再由用户点击写入。
- **负面提示词**可选，默认不附加。只在确有需要时写入不希望出现的可见元素或画面问题。
- Pony 和 Illustrious 更适合清晰的标签/短语组合；FLUX 更适合完整、连贯的自然语言描述。

### 6.3 参考图

当前支持选择一张本地 PNG、JPG/JPEG 或 WebP 参考图，并显示受限缩略图预览。

| 选项 | 含义 |
|---|---|
| 重绘全身 | 将参考图作为整图重绘条件，同时由完整提示词决定最终画面 |
| 仅作参考 | 降低对原图构图的束缚，优先由提示词控制新画面 |
| 参考图权重 | `0.00–0.50`；数值越高越强调参考一致性，过高可能增加沿用半身构图等问题 |

参考图不是局部蒙版编辑，也不保证像素级身份、背景、姿态或未修改区域保持。想改变服装、动作或构图时，应同时说明“保留什么”“改什么”“最终完整画面是什么”。

### 6.4 LoRA

LoRA 与基础生图核心分开选择。点击 **读取真实 LoRA** 后，界面只展示本次 ComfyUI 扫描中与当前核心架构匹配的条目：

- Pony / Illustrious：SDXL LoRA；
- FLUX：Flux LoRA。

选中后可填写两个权重：

| 参数 | 作用 | 常用起点 |
|---|---|---:|
| LoRA 模型权重 | 影响模型特征/风格注入 | `0.8` |
| LoRA 文本权重 | 影响文本条件侧的注入 | `0.8` |

权重可在 `-2` 到 `2` 间调整。一次建议只改一个权重，避免无法判断变化来源。不同模型家族不要混用 LoRA。

### 6.5 Pony 专用标签

选择 Pony 时，可额外选择风格来源标签：动画、卡通、拟兽、Pony 原生；还可选择内容分级标签：通用、敏感、Explicit。标签会作为 Pony 提示词的一部分提交。

这些标签用于模型提示词接线与画面倾向，不等于对输出内容、模型许可或使用场景的合规判断。用户仍需遵守模型、平台和所在地的规则。

### 6.6 分辨率、步数与 CFG

工作台预设：`512×512`、`640×640`、`640×960`、`960×640`、`1024×1024`。

- 初次测试建议从 `640×640` 或 `640×960`、5 轮开始；
- 步数影响采样时间与细节，默认 24；
- CFG/引导值决定模型跟随提示词的程度，默认 6；FLUX 默认倾向 3.5；
- 先确认构图、人物和风格方向，再提高尺寸或步数，避免无效占用计算资源。

### 6.7 Seed 与任务轮次

| 选项 | 行为 |
|---|---|
| 连续生成 5 轮 | 用于低风险试探和快速比较 |
| 连续生成 25 轮 | 用于在确定方向后扩大候选数量 |
| 锁定 Seed | 每轮使用同一 Seed，便于比较其他参数影响 |
| 递进 Seed | 每轮 Seed 自动 `+1` |
| 范围递进 | 在指定 Seed 起止范围内循环 |

任务按轮串行提交。开始前会重新检查 ComfyUI 队列、已选模型和依赖；如果队列不为空，工作台不会抢占或清空其他任务。

## 7. 生成预览、停止与 VLM 审核

右侧 **生成预览与意见** 会显示真实任务状态、每轮 Seed、按需加载的缩略图和可用 VLM 意见。

- **刷新状态**：读取本工作台创建的任务记录与 ComfyUI 结果。
- **停止后续轮次**：不再提交未开始的轮次；已提交的当前轮会继续完成。
- **VLM 审核**：图片完成并归档后，如果 VLM 已配置，会返回真实分数、通过/需修改、摘要、问题、硬性问题及英文修改建议。
- **复制 VLM 修改建议**：只复制，不会自动改写提示词、自动重试或覆盖用户决定。

审核主要用于检查提示词一致性、人物结构、手部、构图、画质与伪影；非人物任务不应被强行按人体结构评价。VLM 审核失败不应把已经完成的出图改成失败。

## 8. 半成品库、参考复用与元数据

每一轮成功图片会自动归档到本机半成品库，同时保留工作台生成参数。素材库支持：

- 加载受限缩略图；
- 查看 VLM 分数、摘要、问题和修改建议；
- 对没有历史审核的旧图手动执行一次 VLM 审核；
- 将某张图设为下一轮参考图；
- 二次确认后清空当前半成品库。

清空操作仅针对本工作台管理的半成品库，不删除 ComfyUI 输出目录、模型或其他文件夹。旧图不会被自动批量审核，也不会凭空补写评分。

PNG 会写入工作台参数，便于在 Windows 图片属性/详细信息或后续工具中追溯：正负提示词、核心、尺寸、步数、CFG、Seed、轮次、参考图模式与权重、LoRA 及其双权重等。

## 9. 已支持、部分支持与暂未支持

### 已支持

- 连接本机、局域网或已配置安全远端的 ComfyUI，并进行固定只读检查；
- 发现真实候选并绑定 Pony、Illustrious、FLUX 三种登记工作流；
- 影视提示词结构化引导；可选 VLM 中文转英文；
- 单参考图整图重绘/参考模式与预览；
- 兼容 LoRA 筛选、模型/文本双权重；
- 5/25 轮、三种 Seed 模式、停止后续轮次；
- 真实输出归档、PNG 参数、半成品库、参考复用和确认式清库；
- VLM 真实审核与素材库审核展示。

### 部分支持/不保证

- 换装、动作、表情、发型、背景、材质和风格变化：通过提示词与整图重绘实现，不保证未改区域完全不变；
- 海报底图、广告视觉、概念设计和系列角色探索：可作为草案，不保证精确文字、版式或跨图角色一致性；
- 参考图相似性：受权重、模型和提示词共同影响，不是像素级锁定；
- 模型发现与工作流依赖：能说明当前接线兼容，不能替代模型 SHA-256 或完整来源审计。

### 暂未支持

- 多张参考图融合；
- 画布框选、涂抹、蒙版、局部重绘与像素级保持；
- OpenPose、Depth、Canny、Sketch 等结构控制；
- 专用超分、老照片修复、面部修复；
- 精确中文文字、品牌字体和最终海报排版；
- 自动生成连续故事分镜、镜头连续性或角色永久一致性；
- 工作台内 SSH 登录、远端部署、端口开放或模型服务启停。

## 10. 常见问题

### 顶部显示“ComfyUI 当前不可达”

先进入 **连接 ComfyUI**，确认当前保存的地址与端口来自运行 ComfyUI 的设备，而不是工作台电脑自身的地址。Alpha33 已修复已验证 Profile 因状态检查误报为不可达的问题；若仍出现，点击检查并保存连接后重新打开工作台。不要为了处理显示问题而清空队列或重启其他人的 ComfyUI 任务。

### 无法选择模型或开始生成

依次检查：ComfyUI 是否已连接、模型与下载页面是否读到了真实候选、是否保存了一个依赖完整的登记核心、当前队列是否为空。FLUX 还需要其 UNET、VAE 和两枚文本编码器同时被发现。

### LoRA 下拉框为空或无法生效

点击 **读取真实 LoRA**。只会出现当前核心架构匹配且位于预期 ComfyUI 目录的 LoRA；Pony/Illustrious 使用 SDXL LoRA，FLUX 使用 Flux LoRA。

### 中文提示词没有自动变英文

确认 VLM 已独立配置并验证。翻译结果是供用户检查的英文草稿，需要点击写入正面提示词；翻译未配置或失败时可直接手动输入英文。

### VLM 没有显示分数

检查 VLM Profile 是否已验证、VLM 是否可达，以及图片是否已成功归档。旧图片不会自动补评分，可在半成品卡片点击 **执行 VLM 审核**。审核未完成时会显示原因，而不是虚构数值。

### 想要全身，但总是生成半身

使用竖图分辨率，在提示词中写明 `full-body shot, head-to-toe, both legs and feet fully visible within the frame, camera pulled back`；参考图为半身时降低参考图权重，并使用“重绘全身”后重新描述完整构图。

## 11. 推荐的新手起点

| 目标 | 核心 | 建议 |
|---|---|---|
| 动画角色设定 | Pony 或 Illustrious | `640×960`、5 轮、先不加 LoRA；先写清全身/半身与视角 |
| 写实人物或产品 | FLUX | `640×640` 或 `640×960`、5 轮、自然语言英文提示词 |
| 影视感人物图 | FLUX 或动画核心 | 先使用“主体 + 场景 + 景别 + 光线 + 色调 + 镜头/景深”结构 |
| 修改已有半成品 | 与原图风格接近的核心 | 在素材库设为参考图，降低参考权重，明确写出要保留与要改变的内容 |

先跑 5 轮，再只修改一到两个变量（例如景别、光线或 LoRA 权重）。这样才能从结果判断是提示词、参考图、核心还是 LoRA 导致了变化。

## 12. 当前版本的发布边界

Alpha34 已完成代码测试、模型哈希核验、受控 DGX 真实工作流验证，以及 Windows Sandbox 无旧数据首次安装、启动、重启和空数据验证。公开发布仍需完成 GitHub 仓库整改、GitHub Actions 构建来源证明，并对 GitHub 实际生成的安装包进行干净 Windows 复验。模型文件完整性仍须在模型所在设备按本说明书的方式复核，不能由 ComfyUI 的只读接口替代。

因此：本说明书描述的是当前本机 Alpha 的实际使用方法，不构成 GitHub 正式发行、商业服务保证或模型许可承诺。
