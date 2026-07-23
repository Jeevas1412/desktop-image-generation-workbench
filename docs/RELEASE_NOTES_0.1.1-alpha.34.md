# DGX 智能生图工作台 0.1.1-alpha.34（UNSIGNED ALPHA）

发布日期：待 GitHub Draft Prerelease 创建后填写。

> 此版本仅面向知情测试。Windows 安装包不含 Authenticode 签名，可能显示 `Unknown Publisher`；不包含 ComfyUI、模型权重、LoRA、VAE、用户图片或服务器凭据。

## 本版本包含

- 连接用户自行运行的 ComfyUI，读取真实节点、候选模型和队列状态。
- 固定 Pony 动画人像、Illustrious 动画人像、FLUX 真实通用三种生图核心与依赖检查。
- 可选参考图、与基础核心分离的兼容 LoRA 选择、双 LoRA 权重、5/25 轮串行任务及 Seed 模式。
- 结构化影视提示词引导；可选 VLM 中文提示词翻译、图片评分和修改建议。
- 真实输出归档、半成品参考复用、PNG 参数写入、素材库评分/意见显示与二次确认清库。
- 连接状态、模型扫描、任务和素材库均以真实数据为准；未连接或未配置时不展示示例模型、伪下载进度或虚构评分。

## 已完成的验证

- 当前受控 DGX 环境中，Pony、Illustrious、FLUX 各完成 5 轮串行真实生成、归档和 VLM 审核；测试没有清空共享队列、重启服务或改写模型。
- Windows Sandbox 中完成 Alpha34 首次安装、首次启动、重启、模型与下载空状态、素材库空状态验证。

## 本发布仍需测试者注意

- GitHub Actions 生成的安装包应在下载后核对 `SHA256SUMS.txt`；GitHub artifact attestation 仅在本次工作流启用且仓库计划支持时核验。
- GitHub Actions 实际产物尚需在干净 Windows 环境再次安装验证；在此之前 Release 必须保持 Draft + Prerelease。
- 当前仓库保持私有，Draft/Prerelease 仅对获授权成员可见；它不构成面向一般用户的下载渠道。
- 模型许可证、下载访问要求、硬件占用和输出用途由使用者自行确认；本项目的 Apache-2.0 许可证不覆盖任何模型权重。
- 工作台不提供 SSH 登录、远端部署、端口开放、模型下载或 ComfyUI 服务启停功能。

## 安装前准备

请先阅读 [README](../README.md) 的 ComfyUI 接线、模型下载准备与故障排查，并参阅 [Alpha34 使用说明书](DGX智能生图工作台使用说明书_Alpha34.md)。
