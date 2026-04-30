# AI招聘助手本地安装版

## 项目目标
AI招聘助手本地安装版旨在提供一个可离线部署、可本地扩展的招聘辅助工具，帮助招聘人员在浏览器中高效处理候选人信息，并通过本地服务完成数据管理、消息处理与统计分析。

## 项目组成
- **plugin/**：Chrome 插件端，负责页面交互与用户操作入口。
- **local_server/**：基于 FastAPI 的本地服务，负责业务逻辑与 SQLite 数据存储。
- **desktop_app/**：桌面启动入口（预留）。
- **installer/**：本地打包与安装脚本（预留）。

## Codex Cloud Environment 安装依赖（必做）
在 Codex 云端环境中，请先执行以下 setup script，避免出现 `ModuleNotFoundError`（如缺少 pydantic）：

```bash
cd ai-recruit-assistant/local_server
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

> 说明：生产环境仍建议完整安装 `requirements.txt`。`priority_service` 内的 fallback 仅用于受限测试环境（例如无法安装 pydantic 的云端沙箱）。

## 快速启动（本地服务）
1. 进入服务目录：
   ```bash
   cd ai-recruit-assistant/local_server
   ```
2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
3. 启动 FastAPI：
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8787
   ```
4. 打开接口文档：
   - Swagger UI: http://127.0.0.1:8787/docs

## 加载 Chrome 插件（开发者模式）
1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择目录：`ai-recruit-assistant/plugin`。
5. 加载后即可在浏览器工具栏看到插件入口。


## Windows 打包与安装（无需用户安装 Python）

### 打包（开发者执行）
1. 在 Windows 上打开 `cmd` 或 PowerShell。
2. 进入安装脚本目录：
   ```bat
   cd ai-recruit-assistant\installer
   ```
3. 运行打包脚本：
   ```bat
   build.bat
   ```
4. 成功后可在 `ai-recruit-assistant\installer\dist\AIRecruitAssistant.exe` 找到可执行文件。

### 安装与运行（最终用户）
1. 将 `AIRecruitAssistant.exe` 分发给用户（可放入安装包或压缩包）。
2. 用户双击 `AIRecruitAssistant.exe` 即可启动本地服务，无需安装 Python。
3. 程序启动后会自动监听：`http://127.0.0.1:8787`。
4. 可访问 `http://127.0.0.1:8787/docs` 验证服务已运行。

### 说明
- 可执行文件入口为 `local_server/run_server.py`，内部会自动启动 FastAPI/Uvicorn。
- 若要做完整安装向导（桌面快捷方式、卸载器），建议后续结合 Inno Setup 或 NSIS。
