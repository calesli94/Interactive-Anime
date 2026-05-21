# AI招聘助手内部试用版

AI Recruit Assistant 是一个本地运行的招聘辅助工具，由两部分组成：

- **浏览器插件（Chrome / Edge）**：读取 BOSS 页面上下文、展示候选人/岗位信息、触发分析和话术生成。
- **本地 FastAPI 服务**：运行在 `http://127.0.0.1:8787`，负责候选人分析、岗位要求库、话术生成、跟进记录和 SQLite 本地存储。

> 内部试用原则：不自动发送消息；插件只辅助读取、分析、生成和填入，最终发送由 HR 人工确认。

## 目录说明

- `plugin/`：Chrome / Edge 插件源码，可直接“加载已解压的扩展程序”。
- `local_server/`：FastAPI 本地服务源码与 SQLite 数据目录。
- `start_local_server.py`：跨平台 Python 启动脚本。
- `start_windows.bat`：Windows 一键启动脚本，会自动创建 `.venv`、安装依赖并启动本地服务。
- `scripts/package_internal_trial.py`：内部试用包打包脚本。
- `installer/package_internal_trial.bat`：Windows 打包脚本入口。
- `release/AIRecruitAssistant-plugin-v0.1.0.zip`：可分发的 Chrome / Edge 插件压缩包。
- `release/AIRecruitAssistant-internal-trial-v0.1.0.zip`：内部试用整包，包含插件、本地服务和启动脚本。

## 一、内部试用包内容

发布压缩包不提交到 Git。更新分支或创建 PR 时如果平台提示“不支持二进制”，请不要提交 `release/*.zip`；改为在本地或 CI 执行打包脚本生成：

```bash
python scripts/package_internal_trial.py
```

生成文件位于：

```text
release/AIRecruitAssistant-plugin-v0.1.0.zip
release/AIRecruitAssistant-internal-trial-v0.1.0.zip
```

分发给内部试用人员时，推荐发送：

```text
AIRecruitAssistant-internal-trial-v0.1.0.zip
```

如果对方只需要插件源码包，也可以单独发送：

```text
AIRecruitAssistant-plugin-v0.1.0.zip
```

## 二、Windows 内部安装流程

### 1. 安装 Python

1. 打开 Python 官网：<https://www.python.org/downloads/>
2. 安装 Python 3.10 或以上版本。
3. 安装时务必勾选：

```text
Add python.exe to PATH
```

安装完成后，打开 `cmd` 验证：

```bat
python --version
```

### 2. 解压内部试用包

将 `AIRecruitAssistant-internal-trial-v0.1.0.zip` 解压到本地目录，例如：

```text
D:\AIRecruitAssistant
```

### 3. 一键启动本地服务

双击：

```text
start_windows.bat
```

脚本会自动执行：

1. 创建本地虚拟环境 `.venv`
2. 安装 `local_server/requirements.txt`
3. 启动 FastAPI 服务
4. 监听地址：`http://127.0.0.1:8787`

启动成功后可以打开：

```text
http://127.0.0.1:8787/health
http://127.0.0.1:8787/docs
```

看到 `{"status":"ok"}` 或 Swagger 文档，即表示本地服务正常。

## 三、手动启动本地服务（可选）

如果不使用 bat，可在解压目录执行：

```bash
python -m pip install --upgrade pip
python -m pip install -r local_server/requirements.txt
python start_local_server.py
```

或进入服务目录执行：

```bash
cd local_server
python -m pip install -r requirements.txt
python run_server.py
```

## 四、加载 Chrome / Edge 插件

### Chrome

1. 打开：`chrome://extensions/`
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择解压后的：

```text
plugin
```

### Edge

1. 打开：`edge://extensions/`
2. 开启左侧或右侧的“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择解压后的：

```text
plugin
```

> 注意：浏览器不能直接加载 zip，必须先解压，选择 `plugin/` 文件夹。

## 五、BOSS 页面使用流程

1. 先启动本地服务，确认 `http://127.0.0.1:8787/health` 正常。
2. 加载 Chrome / Edge 插件。
3. 打开 BOSS 聊天页：

```text
https://www.zhipin.com/web/chat/index
```

4. 点击具体候选人会话。
5. 打开插件，点击“刷新上下文”。
6. 如果岗位只有名称、没有 JD：
   - 在“当前岗位”区域粘贴岗位描述、岗位职责、任职要求、关键词。
   - 点击“保存岗位要求库”。
7. 点击“分析候选人”。
8. 点击“生成话术”。
9. 需要时点击“填入输入框”，由 HR 最终人工检查并发送。

## 六、岗位要求库使用说明

BOSS 聊天页通常只能抓到“沟通职位：岗位名称”，无法稳定抓到完整 JD。因此内部试用版使用本地岗位要求库：

1. 插件先自动识别当前岗位名称，例如 `AI视频`。
2. 如果本地已有同名岗位配置，会自动加载岗位描述、职责、要求和关键词。
3. 如果本地没有配置，会提示“当前岗位缺少JD，请补充岗位要求”。
4. HR 手动粘贴 JD 后点击“保存岗位要求库”。
5. 下次再遇到同名岗位，插件会自动加载已保存 JD。

岗位要求库保存在本地 SQLite：

```text
local_server/data/recruit_assistant.db
```

## 七、重新打包内部试用版

开发者如需重新生成 zip 包：

```bash
cd ai-recruit-assistant
python scripts/package_internal_trial.py
```

Windows 也可以双击：

```text
installer\package_internal_trial.bat
```

输出目录：

```text
release/
```

## 八、依赖安装

本地服务依赖位于：

```text
local_server/requirements.txt
```

安装命令：

```bash
python -m pip install -r local_server/requirements.txt
```

## 九、完整操作手册

面向内部试用人员的完整安装与使用手册见：

```text
docs/INTERNAL_TRIAL_USER_MANUAL.md
```

该手册可随内部试用包一起发送给其他使用者。

## 九、常见问题

### 1. 插件提示“本地服务未启动”

请确认 `start_windows.bat` 窗口仍在运行，并访问：

```text
http://127.0.0.1:8787/health
```

### 2. 双击 bat 后提示找不到 Python

重新安装 Python，并勾选 `Add python.exe to PATH`。

### 3. 插件加载失败

请确认选择的是解压后的 `plugin/` 文件夹，而不是 zip 文件。

### 4. 岗位分析不准

如果岗位只有名称没有 JD，请先补充岗位要求并保存到岗位要求库，再重新分析候选人。

### 5. 端口被占用

默认端口是 `8787`。如果已有旧服务窗口在运行，请先关闭旧窗口后重启。
