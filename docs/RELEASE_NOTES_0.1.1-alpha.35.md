# DGX 智能生图工作台 0.1.1-alpha.35（UNSIGNED ALPHA 候选）

> 这是面向个人研究、学习和非生产测试的 Unsigned Alpha 候选，不提供商业服务或生产级支持。它不是“禁止商业使用”的许可证声明：源代码仍采用 Apache-2.0；模型、LoRA、VAE 与上游节点的许可证需要分别遵守。

## 本次候选的变化

- 统一公开页面、发布流程和生成说明中的项目定位文字。
- 清理测试夹具中曾出现的真实 DGX 主机名和私有地址，改用通用局域网示例。
- 保留已完成 Alpha34 私有 Draft 的安装包与验收记录，不对该已构建产物作追溯性修改。

## 发布前仍必须完成

1. 在 GitHub Actions 以本版本号重新构建 Draft + Prerelease。
2. 下载安装包后核对 `SHA256SUMS.txt`，确认安装包保持 `NotSigned`，且不含模型权重或凭据。
3. 在干净 Windows 环境完成首次安装、启动、重启、卸载/重装的独立验收。
4. 在仓库改为公开前，复核公开树、提交历史、Release 资产和 Actions 日志，确保不存在真实内网地址、凭据、用户素材或本地审计记录。

## 使用边界

- 安装包不包含 ComfyUI、模型权重、LoRA、VAE、用户图片、生成记录或服务器凭据。
- 使用者自行准备并运行 ComfyUI，再由工作台连接其实际可访问的地址和端口。
- GitHub provenance 或 artifact attestation 不能替代 Windows Authenticode 签名，也不能证明软件适用于生产环境。
