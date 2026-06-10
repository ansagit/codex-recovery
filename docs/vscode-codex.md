# VS Code Codex 专属恢复入口

## 目标

`vscode-codex` 只负责 VS Code Codex 的任务断点恢复。

- 不做 VS Code 通用重装恢复。
- 不抓取 VS Code Codex 内部私有状态。
- 只保存 VS Code Codex 相关工作状态。

## 固定目录规则

1. VS Code Codex 专属工作目录：

   `D:\Codex\VSCode`

2. 本地运行数据、断点文件、resume 文件、restore-plan 文件：

   `D:\Codex\VSCode.codex-recovery\`

3. 用户导出说明文件、命令文件、检查报告、手册、txt、md、sql 等：

   `D:\Download`

4. 写入 `D:\Download` 前会检查同名文件。除非使用 `--force`，不会直接覆盖。

## 保存内容范围

- 当前 workspace
- 当前 Git 状态
- 最近任务说明
- 已完成内容
- 未完成内容
- 下一步建议
- Codex 扩展是否存在
- VS Code 插件和设置的简单检查结果
- 重装后只做简单检查：VS Code 是否安装
- Codex 扩展是否安装
- `D:\Codex\VSCode` 是否存在
- 最近 `vscode-codex` checkpoint 是否存在

## 不做内容

- 不上传完整聊天记录
- 不抓取 VS Code Codex 内部私有状态
- 不影响 Windows CLI 和 WSL CLI 已完成的功能

## 运行命令

```powershell
cd D:\Codex\Windows\workspace\codex-recovery
vscode-codex help
vscode-codex checkpoint
vscode-codex resume
vscode-codex resume --download
vscode-codex restore-plan --download
```

## 导出规则

- `D:\Download` 里的说明文件使用固定文件名。
- 不要生成带时间戳的新文件。
- 小修改直接覆盖同名文件。
- 文件内容尽量中文。
- 固定输出：
  - `D:\Download\vscode-codex-resume.md`
  - `D:\Download\vscode-codex-recovery-operation-guide.txt`

## 默认恢复流程

1. 重新打开 VS Code。
2. 确认已经登录 Codex 账号。
3. 打开 VS Code 右侧 CODEX 对话框。
4. 输入提示词继续上次任务。
5. 只有在 VS Code Codex 无法打开、无法登录或无法读取上次任务时，才使用 PowerShell 或本地恢复命令作为备用方式。
