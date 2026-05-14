# ai-recruit-assistant

BOSS 直聘招聘辅助工具 MVP，包含：

- **browser_extension/**：Edge/Chrome 浏览器插件，Manifest V3。
- **local_server/**：本地 FastAPI 服务。
- **local_server/data/recruit_assistant.db**：运行后自动创建的 SQLite 本地人才库。

第一阶段目标是跑通最小链路：在候选人页面抓取文本 → 调用本地服务做 mock AI 分析 → 生成个性化打招呼话术 → 保存到本地人才库。

## 目录结构

```text
ai-recruit-assistant/
├─ browser_extension/
│  ├─ manifest.json      # Manifest V3 插件配置
│  ├─ content.js         # 注入页面，抓取 document.body.innerText
│  ├─ popup.html         # 插件弹窗页面
│  ├─ popup.js           # 弹窗交互逻辑，调用本地 FastAPI
│  └─ styles.css         # 弹窗基础样式
├─ local_server/
│  ├─ main.py            # FastAPI 接口入口
│  ├─ database.py        # SQLite 初始化和连接工具
│  ├─ run_server.py      # Windows 友好的启动入口
│  ├─ requirements.txt   # Python 依赖
│  └─ data/.gitkeep      # 保留 data 目录，数据库运行后自动生成
└─ README.md
```

## Windows 下启动后端

> 以下命令可在 PowerShell 或 CMD 中执行。请先安装 Python 3.10+。

1. 进入后端目录：

```bat
cd ai-recruit-assistant\local_server
```

2. 创建虚拟环境：

```bat
python -m venv .venv
```

3. 激活虚拟环境：

PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
```

CMD：

```bat
.venv\Scripts\activate.bat
```

4. 安装依赖：

```bat
python -m pip install --upgrade pip
pip install -r requirements.txt
```

5. 启动 FastAPI：

```bat
uvicorn main:app --reload --host 127.0.0.1 --port 8787
```

也可以使用项目提供的启动脚本：

```bat
python run_server.py
```

6. 浏览器打开接口文档：

```text
http://127.0.0.1:8787/docs
```

## 加载 Edge/Chrome 浏览器插件

Chrome：

1. 打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目的 `ai-recruit-assistant\browser_extension` 目录。
5. 打开任意候选人页面，点击浏览器工具栏中的插件图标。

Edge：

1. 打开 `edge://extensions/`。
2. 打开“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择 `ai-recruit-assistant\browser_extension` 目录。

## 如何测试

### 1. 测试健康检查

后端启动后，打开：

```text
http://127.0.0.1:8787/health
```

看到类似结果表示成功：

```json
{"status":"ok","service":"ai-recruit-assistant"}
```

### 2. 测试保存候选人

PowerShell 示例：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/candidates" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"name":"张三","title":"Python 后端","raw_text":"张三 熟悉 Python FastAPI SQLite","source_url":"https://example.com/candidate/1"}'
```

### 3. 测试 mock AI 分析

PowerShell 示例：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/analyze" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"candidate":{"name":"张三","title":"Python 后端","raw_text":"张三 熟悉 Python FastAPI SQLite","source_url":"https://example.com/candidate/1"},"job_requirement":"招聘 Python FastAPI 后端，熟悉 SQLite 优先"}'
```

如果返回 `score`、`summary`、`greeting` 等字段，说明分析接口成功。

### 4. 测试插件端到端流程

1. 确认本地服务正在运行。
2. 打开一个候选人页面或任意测试网页。
3. 点击插件图标。
4. 点击“检查本地服务状态”，应显示服务已连接。
5. 点击“抓取当前页面候选人信息”，文本框应出现当前页面文本。
6. 点击“保存到本地人才库”，应返回 `candidate_id`。
7. 点击“发送到本地服务分析”，应展示 mock 分析结果和打招呼话术。


### 5. 测试 BOSS 推荐牛人 DOM 调试模式

当前阶段优先确认真实候选人卡片 DOM，不继续盲猜 selector，也不依赖字段解析结果。

1. 打开 BOSS 直聘“推荐牛人”列表页。
2. 打开浏览器开发者工具 Console。
3. 点击插件里的“输出候选人 DOM 调试”。
4. Console 应看到类似日志：`[AI Recruit] debug nodes found: N`，其中 `N` 应大于 0。
5. 页面中间的候选人疑似节点会出现红色描边，用于确认插件当前识别到的区域。
6. 插件弹窗的“DOM 调试结果”区域会展示前 50 个疑似节点，包括：序号、tag、className、宽高、salary/age/education/greeting 命中情况、xpath 和 `textPreview`。
7. `textPreview` 应能看到真实候选人卡片内容，例如候选人姓名、`10-15K`、`本科/硕士`、`打招呼`。
8. 左侧导航不应出现红色描边；如果出现，请记录对应 `className`、`xpath`、宽高和 `textPreview`，用于下一轮精确排除。

DOM 调试规则在 `browser_extension/content.js` 中实现：遍历 `div/li/section/article`，收集节点尺寸、文本长度、薪资/年龄/学历/打招呼命中情况和 XPath；只输出命中薪资、年龄或“打招呼”的前 50 个节点，并在页面上用红框高亮这些节点。

## 已实现接口

- `GET /health`：本地服务健康检查。
- `POST /api/candidates`：保存候选人到 SQLite。
- `GET /api/candidates`：查看最近 20 条候选人，方便验证。
- `POST /api/analyze`：规则和 mock 版本的 AI 匹配分析。

## 下一步建议

1. 为 BOSS 直聘候选人页补充更精细的 DOM selector，提取姓名、年龄、经验、技能、期望薪资等结构化字段。
2. 增加候选人去重逻辑，避免同一候选人被重复保存。
3. 接入真实大模型接口，替换 `mock_analyze`。
4. 增加岗位配置页面，让招聘人员维护岗位 JD 和关键词。
5. 增加本地人才库搜索、标签、备注和跟进状态。
