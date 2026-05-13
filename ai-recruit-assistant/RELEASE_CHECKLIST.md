# AI 招聘助手内部试用版发布检查清单

发布前请逐项检查：

- [ ] `install.bat` 可运行，并能完成依赖安装。
- [ ] `start.bat` 可运行，并显示服务地址和“请不要关闭此窗口”。
- [ ] `check_env.bat` 可运行，并能输出 Python、pip、依赖、端口、数据库检查结果。
- [ ] `http://127.0.0.1:8787/health` 返回 `{"status":"ok"}`。
- [ ] `http://127.0.0.1:8787/dashboard` 可正常打开。
- [ ] Edge 可通过 `edge://extensions` 加载 `plugin` 文件夹。
- [ ] BOSS 页面中插件可刷新上下文。
- [ ] 候选人可保存到 `/api/candidates`。
- [ ] 岗位可保存到 `/api/jobs` 或岗位要求库。
- [ ] 匹配记录可保存到 `/api/matches`。
- [ ] dashboard 能显示候选人、岗位、匹配记录。
- [ ] 搜索候选人可用，例如搜索公司、项目、风格关键词。
- [ ] `local_server/data/recruitment.db` 能自动生成。
- [ ] 换一台未配置过的电脑，按 README_INTERNAL.md 流程测试通过。
- [ ] 确认不会自动发送消息，所有消息发送都需要人工确认。
