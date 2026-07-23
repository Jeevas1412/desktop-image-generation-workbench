# GitHub Unsigned Alpha 发布流程

本流程只用于知情测试者。它生成未经过 Windows Authenticode 签名的 NSIS 安装器，并在 GitHub 中创建 **Draft + Prerelease**；不得将其描述为正式版、稳定版或生产可用版本。

项目定位是个人研究、学习和非生产测试，不提供商业服务或生产级支持。源代码继续使用 Apache-2.0；该定位不替代模型、LoRA、VAE 或上游组件各自的许可证与使用条件。

## 发布前硬门禁

执行工作流前必须全部满足：

1. 仓库可以是公开或私有仓库，且 Actions 已启用。私有仓库的 Draft/Prerelease 仅对获授权成员可见，不适合面向一般用户下载。
2. 根 `LICENSE` 为 Apache License 2.0，四个 `package.json` 的 SPDX 标识均为 `Apache-2.0`；没有许可证时工作流必须失败。
3. `CHANGELOG.md` 和 `THIRD_PARTY_NOTICES.md` 存在。
4. 根、前端、后端和桌面 `package.json` 使用同一个 `x.y.z-alpha.n` 版本。
5. CI、NSIS 构建、包体资源扫描、权重/秘密扫描全部通过。
6. 安装器必须明确为 `NotSigned`，文件名必须包含 `UNSIGNED-ALPHA`。
7. Release 只能先创建为 Draft 和 Prerelease，由项目所有者复核后再决定是否发布。

## GitHub 仓库设置

1. 在仓库 Settings → Actions → General 中允许仓库 Actions 运行。
2. 创建名为 `unsigned-alpha` 的 Environment，并建议配置 required reviewer。
3. Workflow permissions 允许工作流创建 Release；工作流自身只申请 `contents: write`、`id-token: write` 和 `attestations: write`。
4. 不添加证书、PFX、密码、SSH 密钥或 DGX 凭据。

## 手工触发

在 Actions 中选择 **Unsigned Alpha Draft Release**，点击 **Run workflow**：

- `version`：必须与四个 package.json 一致，例如 `0.1.1-alpha.1`。
- `acknowledgement`：必须准确输入 `PUBLISH_UNSIGNED_ALPHA`。
- `generate_attestation`：公开仓库或已确认支持私有 attestation 时选中；普通私有仓库保持关闭。

工作流将依次执行：

1. 公共仓库树和许可证门禁；
2. 锁定依赖安装与 51/33/9 离线 CI；
3. NSIS 构建；
4. 包内前端、后端、catalog 和 contracts 检查；
5. 模型权重、凭据和缓存文件扫描；
6. Authenticode 必须为 `NotSigned`；
7. SHA-256、SPDX SBOM、release manifest 和警告说明生成；
8. 若已启用，生成 GitHub artifact attestation；
9. 创建 Draft + Prerelease。

## Draft 人工复核

不要直接点击 Publish。先下载工作流产物并核对：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\DGX-Image-Workbench-Setup-x.y.z-UNSIGNED-ALPHA.exe
Get-AuthenticodeSignature -LiteralPath .\DGX-Image-Workbench-Setup-x.y.z-UNSIGNED-ALPHA.exe
gh attestation verify .\DGX-Image-Workbench-Setup-x.y.z-UNSIGNED-ALPHA.exe -R OWNER/REPOSITORY
```

预期结果：哈希匹配、Authenticode 为 `NotSigned`；若本次已启用且仓库计划支持 attestation，GitHub attestation 还应指向正确仓库、commit 和工作流。

随后仍需在干净 Windows 11 标准用户环境验证安装、首次启动、重启、卸载、重装和数据保留。未经这一步，Draft 不得转为公开 Prerelease。

## 对测试者必须显著展示

- 未签名，Windows 会显示 `Unknown Publisher` 或阻止执行；
- 仅供 Alpha 测试；
- 不包含模型权重；
- 没有完成真实 DGX 验证；
- 不保证生产稳定性；
- 出现安全警告时不得指导用户关闭 Defender、SmartScreen 或 Smart App Control。

GitHub provenance 只能证明制品来自特定仓库、commit 和 Actions 工作流，不能替代 Windows Authenticode，也不能证明软件本身安全。
