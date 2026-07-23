# DGX 智能生图工作台

面向本机、局域网工作站或已安全接入远端的 Windows 桌面端生图控制台。它连接**已经运行的 ComfyUI**，提供真实模型扫描、Pony / Illustrious / FLUX 固定工作流、参考图、LoRA、5/25 轮任务、半成品归档和可选 VLM 翻译/审核。

当前源码候选版本：**`0.1.1-alpha.35`（Unsigned Alpha）**。

> 这是知情测试版本，不是生产版。安装包未进行 Windows Authenticode 签名，Windows 可能显示 `Unknown Publisher`。项目不包含任何模型权重、ComfyUI、用户图片、生成记录或服务器凭据。

> 项目定位：面向个人研究、学习和非生产测试，不提供商业服务、付费功能或生产级支持。这是项目定位说明，不会把 Apache-2.0 改写为“禁止商业使用”的许可证；模型、LoRA 和上游组件仍分别遵循各自许可证。

## 已验证的范围

- 当前受控 DGX / ComfyUI 环境下，Pony、Illustrious 与 FLUX 三个登记核心各完成 5 轮串行真实生成、归档和 VLM 审核验证；测试不清空队列、不重启服务、不改写模型。
- Windows Sandbox 的无旧数据环境完成首次安装、首次启动、空模型/下载页、空素材库和单实例重启验证。

这些结果只说明 Alpha34 已构建产物的当前验证边界；Alpha35 在新的 GitHub 构建产物完成哈希核对与干净 Windows 复验前，仍只是源码候选。不同显卡、ComfyUI 版本、模型文件和网络环境仍需自行复验。

## 安装与首次使用

1. 从 GitHub **Releases 的 Prerelease** 下载名称包含 `UNSIGNED-ALPHA` 的 Windows 安装包；同时下载并核对 `SHA256SUMS.txt`。
2. 安装并启动工作台。首次打开时显示“ComfyUI 未配置”是正常状态。
3. 确保一台机器上的 ComfyUI 已启动，并已放入至少一种支持核心及其依赖。
4. 在“连接 ComfyUI”中填写该 ComfyUI 实例实际监听的地址与端口，点击“检查并保存连接”。
5. 在“模型与下载”读取真实状态，选择依赖完整的生图核心；随后进入“生图工作台”。

安装包不会代替你安装/启动 ComfyUI，也不会自动下载模型或开启服务器端口。

## ComfyUI 如何接线

工作台只会访问用户填写的 ComfyUI `GET /object_info` 和生成所需的固定 API；不会保存 SSH 私钥、系统密码或服务器命令。

| ComfyUI 在哪里运行 | 地址填写方法 |
| --- | --- |
| 同一台电脑 | 填写 `127.0.0.1` 与 ComfyUI 实际端口。`8188` 是常见示例；`8189`、`8190` 仅用于辅助排查，均不是固定值或本项目的环境预设。 |
| 局域网另一台电脑 | 填写**运行 ComfyUI 那台电脑**的局域网 IP/主机名和实际端口，不要填写工作台电脑自己的 IP。 |
| 已配置安全远端 | 先由用户或管理员完成 VPN、反向代理或 SSH 隧道等安全接入；工作台只填写最终可访问的地址与端口。 |

在运行 ComfyUI 的设备上，可使用以下命令帮助确认信息：

```bash
# DGX / Linux：查看局域网地址；优先以 ComfyUI 启动参数中的 --port 为准
hostname -I
ss -ltn | grep -E ':(8188|8189|8190)\b'
```

```powershell
# Windows：查看本机 IPv4 地址；以 ComfyUI 启动窗口或监听结果中的端口为准
ipconfig
netstat -ano | findstr :8188
netstat -ano | findstr :8189
```

连接成功只表示只读接口可达；工作台会在每次提交前再次检查已选核心、依赖和队列，不会抢占或清空其他 ComfyUI 任务。

## 模型下载准备

先按 [ComfyUI Windows 官方安装说明](https://docs.comfy.org/installation/desktop/windows) 安装 ComfyUI。下载后放入对应目录、刷新或重启 ComfyUI，再回到“模型与下载”读取真实状态。不要随意改名。

| 核心 | 必要资源 | 下载与存放位置 |
| --- | --- | --- |
| Pony 动画人像 | Pony Diffusion V6 XL + SDXL VAE | [Pony](https://hf-mirror.com/LyliaEngine/Pony_Diffusion_V6_XL/resolve/14885f1c01d7723bcbf676773def286c1fd733bc/ponyDiffusionV6XL_v6StartWithThisOne.safetensors) → `models/checkpoints/`；[SDXL VAE](https://hf-mirror.com/LyliaEngine/Pony_Diffusion_V6_XL/resolve/14885f1c01d7723bcbf676773def286c1fd733bc/sdxl_vae.safetensors) → `models/vae/` |
| Illustrious 动画人像 | Illustrious XL v0.1 + SDXL VAE | [Illustrious](https://hf-mirror.com/OnomaAIResearch/Illustrious-xl-early-release-v0/resolve/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/Illustrious-XL-v0.1.safetensors) → `models/checkpoints/`；复用上方 SDXL VAE |
| FLUX 真实通用 | FLUX UNet + VAE + CLIP-L + T5-XXL | [UNet](https://hf-mirror.com/Comfy-Org/flux1-kontext-dev_ComfyUI/resolve/c215e51f94373df8914054c98ba67575c0c2b157/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors) → `models/unet/` 或 `models/diffusion_models/`；[CLIP-L / T5](https://hf-mirror.com/comfyanonymous/flux_text_encoders/tree/6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5) → `models/text_encoders/`；[VAE](https://hf-mirror.com/black-forest-labs/FLUX.1-dev/resolve/3de623fc3c33e44ffbe2bad470d0f45bccf2eb21/ae.safetensors) → `models/vae/` |

以上是访问镜像，不改变上游模型条款。模型权重不随本项目分发；许可证、访问要求和使用条件以模型上游页面为准。

可选 VLM 用于中文提示词翻译与图片审核。它不是生图的必需条件；若不配置，工作台仍可执行不依赖 VLM 的真实生图流程。

## 使用提示与已知限制

- Pony / Illustrious 更适合动画人物；使用 SDXL LoRA。FLUX 更适合写实人物、产品与场景；使用 Flux LoRA。
- 正面提示词实际提交应为英文；可以先让已配置 VLM 生成翻译草稿，再由用户确认写入。
- 参考图是整图参考/重绘，不是局部像素级锁定。需要全身时请明确写 `full-body shot, head-to-toe, both legs and feet fully visible within the frame`。
- 任务只支持 5 或 25 轮串行提交；“停止”只停止后续轮次，不会全局中断或清空 ComfyUI 队列。
- VLM 的评分和建议是可选辅助信息，不替代人工审图；VLM 不可达时不会伪造评分。
- 暂不支持在工作台内登录 SSH、部署远端 ComfyUI、开启端口、自动下载模型或精确局部修图。

## 故障排查

| 现象 | 先检查什么 |
| --- | --- |
| “ComfyUI 当前不可达” | 地址是否属于运行 ComfyUI 的设备、端口是否与启动日志一致、网络/VPN/防火墙是否允许访问。不要清空队列或重启他人的任务。 |
| 无法选择核心或开始生成 | 重新读取真实状态；确认核心、VAE/文本编码器等依赖均被发现，且当前队列为空。FLUX 必须同时发现 UNet、VAE、CLIP-L 和 T5-XXL。 |
| LoRA 列表为空 | 点击“读取真实 LoRA”，并确认 LoRA 放在预期目录且与当前核心架构匹配。Pony/Illustrious 使用 SDXL LoRA；FLUX 使用 Flux LoRA。 |
| 中文没有自动翻译 / 没有 VLM 评分 | 检查 VLM 地址、端口和兼容接口；VLM 是独立可选服务，不会由 ComfyUI 自动提供。 |
| 素材库没有图 | 素材库只显示本工作台实际归档的图片；不会扫描或展示任意 ComfyUI 输出目录。 |

## 面向测试者的完整说明

详细的提示词引导、参数说明、参考图与 LoRA 用法、半成品库和模型文件校验，请阅读：[使用说明书](docs/DGX智能生图工作台使用说明书_Alpha34.md)。该说明书描述当前功能；具体安装包版本以 Release 页面与 SHA256SUMS 为准。

发布流程与未签名安装包验证见：[GitHub Unsigned Alpha 发布流程](docs/GITHUB_UNSIGNED_ALPHA_RELEASE.md)。

## 开发与发布验证

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
npm.cmd --prefix backend test
npm.cmd --prefix desktop test
npm.cmd run release:verify-public-tree
```

发布 GitHub Unsigned Alpha 前还需要基于 GitHub Actions 实际生成的安装包核对哈希，并在干净 Windows 环境复验该**发布产物**。私有仓库的 Release 仅对获授权成员可见；公开发布前还应再次完成公开树与 Actions 日志检查。artifact attestation 仅在仓库计划支持时可选生成。

## 安全与许可证

渲染进程不持有 Node、SSH、Token 或任意网络命令通道；桌面请求通过白名单 IPC。高影响清理操作先生成计划并要求明确确认。详见 [SECURITY.md](SECURITY.md)。

本项目采用 [Apache License 2.0](LICENSE)。项目的非商用定位不改变该许可证本身；模型及其权重不包含在本项目中，且不受本项目许可证覆盖。
