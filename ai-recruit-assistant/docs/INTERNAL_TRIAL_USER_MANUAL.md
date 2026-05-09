# AI Recruit Assistant 内部试用安装使用手册

适用对象：收到内部试用包的 HR / 招聘同学 / 内部测试人员。

适用系统：Windows 10/11，Chrome 或 Microsoft Edge。

> 安全说明：本工具不会自动发送消息。插件只负责读取当前 BOSS 页面、辅助分析、生成建议话术和填入输入框；最终是否发送由使用者人工确认。

---

## 1. 你会收到什么文件

通常你会收到一个压缩包：

```text
AIRecruitAssistant-internal-trial-v0.1.0.zip
```

解压后目录大致如下：

```text
AIRecruitAssistant/
├─ plugin/                  # 浏览器插件目录，Chrome / Edge 加载这个文件夹
├─ local_server/            # 本地 FastAPI 服务
├─ start_windows.bat        # Windows 一键启动脚本
├─ start_local_server.py    # Python 启动脚本
└─ README.md                # 项目说明
```

如果只收到插件包：

```text
AIRecruitAssistant-plugin-v0.1.0.zip
```

则需要另行获得并启动本地服务，否则插件会提示“本地服务未启动”。

---

## 2. 安装前准备

### 2.1 安装 Python

1. 打开 Python 官网：<https://www.python.org/downloads/>
2. 下载并安装 Python 3.10 或以上版本。
3. 安装时务必勾选：

```text
Add python.exe to PATH
```

4. 安装完成后，打开 Windows `cmd`，执行：

```bat
python --version
```

如果能看到类似 `Python 3.12.x`，说明 Python 安装成功。

### 2.2 安装 Chrome 或 Edge

任选其一：

- Chrome：<https://www.google.com/chrome/>
- Microsoft Edge：Windows 通常已自带

---

## 3. 解压内部试用包

1. 右键 `AIRecruitAssistant-internal-trial-v0.1.0.zip`。
2. 选择“全部解压”或使用 7-Zip 解压。
3. 建议解压到无中文、无特殊符号的路径，例如：

```text
D:\AIRecruitAssistant
```

解压后请确认目录里存在：

```text
start_windows.bat
plugin\manifest.json
local_server\requirements.txt
```

---

## 4. 启动本地服务

### 4.1 推荐方式：双击启动

双击解压目录中的：

```text
start_windows.bat
```

脚本会自动完成：

1. 检查 Python 是否可用。
2. 创建本地虚拟环境 `.venv`。
3. 安装后端依赖。
4. 启动本地 FastAPI 服务。

启动成功后，命令行窗口会显示服务地址：

```text
http://127.0.0.1:8787
```

请保持这个窗口不要关闭。关闭窗口即停止本地服务。

### 4.2 验证服务是否启动成功

打开浏览器访问：

```text
http://127.0.0.1:8787/health
```

如果看到：

```json
{"status":"ok"}
```

说明服务正常。

也可以访问接口文档：

```text
http://127.0.0.1:8787/docs
```

### 4.3 可选：手动启动

如果不使用 bat，可在解压目录打开命令行执行：

```bat
python -m pip install --upgrade pip
python -m pip install -r local_server\requirements.txt
python start_local_server.py
```

---

## 5. 加载浏览器插件

### 5.1 Chrome 加载方式

1. 打开 Chrome。
2. 地址栏输入：

```text
chrome://extensions/
```

3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压目录中的：

```text
plugin
```

6. 成功后，浏览器工具栏会出现 `AI Recruit Assistant` 插件。

### 5.2 Edge 加载方式

1. 打开 Edge。
2. 地址栏输入：

```text
edge://extensions/
```

3. 打开“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择解压目录中的：

```text
plugin
```

6. 成功后，浏览器工具栏会出现 `AI Recruit Assistant` 插件。

> 注意：浏览器加载的是 `plugin` 文件夹，不是 zip 文件。

---

## 6. 在 BOSS 直聘页面使用

### 6.1 打开页面

1. 确认本地服务窗口仍在运行。
2. 打开 BOSS 直聘聊天页：

```text
https://www.zhipin.com/web/chat/index
```

3. 登录 BOSS 账号。
4. 点击左侧某个候选人会话，确保右侧打开了当前候选人的聊天窗口。

### 6.2 刷新页面上下文

1. 点击浏览器工具栏中的 `AI Recruit Assistant` 插件图标。
2. 点击“刷新上下文”。
3. 插件会尝试识别：
   - 当前页面类型
   - 当前岗位名称
   - 当前候选人信息
   - 当前聊天对象

如果识别失败，请确认你已经点击了具体候选人会话，而不是停留在空白聊天页。

---

## 7. 配置岗位要求库（很重要）

BOSS 聊天页通常只能抓到岗位名称，例如：

```text
AI视频
```

但抓不到完整 JD。因此第一次遇到某个岗位时，需要手动补充岗位要求。

### 7.1 保存岗位要求

在插件的“当前岗位”区域填写：

1. **岗位描述**：项目方向、岗位背景。
2. **岗位职责**：具体工作内容。
3. **任职要求**：技能要求、经验要求、加分项。
4. **关键词**：用逗号分隔，例如：

```text
AI视频,ComfyUI,Stable Diffusion,分镜,镜头语言,剪辑,游戏美术,动画
```

填写完成后点击：

```text
保存岗位要求库
```

保存后会写入本地 SQLite 数据库。

### 7.2 自动加载同名岗位

下次再遇到同名岗位，例如仍然是 `AI视频`：

1. 点击“刷新上下文”。
2. 插件会自动根据岗位名称查询本地岗位要求库。
3. 如果找到同名配置，会显示：

```text
已加载岗位要求库
```

然后候选人分析和话术生成都会基于已保存的岗位职责/任职要求，而不是只基于岗位名称。

---

## 8. 分析候选人

1. 确保已经打开具体候选人的聊天窗口。
2. 点击“刷新上下文”。
3. 如果当前岗位缺少 JD，请先补充并保存岗位要求库。
4. 点击：

```text
分析候选人
```

分析结果会显示：

- 匹配度
- 等级
- 优先级
- 推荐动作
- 匹配项
- 缺失项
- 风险项
- 评分可靠性

如果没有补充岗位要求，系统仍可低可信度分析，但会提示补充 JD 后重新分析。

---

## 9. 生成并使用话术

1. 完成候选人分析后，点击：

```text
生成话术
```

2. 插件会显示建议话术。
3. 可点击：

```text
复制
```

或：

```text
填入输入框
```

4. 请人工检查话术内容。
5. 确认无误后，再由 HR 手动发送。

> 注意：系统不会自动发送消息。

---

## 10. 聊天分析和跟进

如果需要分析聊天状态：

1. 打开候选人聊天窗口。
2. 点击“分析聊天”。
3. 系统会给出状态、阶段和建议动作。
4. 如需加入跟进，点击“加入跟进”。

今日待跟进会显示在插件下方“今日待跟进”区域。

---

## 11. 退出和再次使用

### 11.1 退出

关闭 `start_windows.bat` 打开的命令行窗口即可停止本地服务。

### 11.2 再次使用

下次使用时：

1. 双击 `start_windows.bat`。
2. 打开 BOSS 页面。
3. 点击插件使用。

浏览器插件通常只需加载一次，不需要每次重新加载。

---

## 12. 常见问题

### Q1：插件提示“本地服务未启动”

请确认：

1. `start_windows.bat` 窗口仍在运行。
2. 浏览器能访问：

```text
http://127.0.0.1:8787/health
```

如果不能访问，请重新双击 `start_windows.bat`。

### Q2：双击 bat 提示找不到 Python

请重新安装 Python，并确保安装时勾选：

```text
Add python.exe to PATH
```

### Q3：依赖安装很慢或失败

可能是网络问题。可尝试：

```bat
python -m pip install -r local_server\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

然后再运行：

```bat
python start_local_server.py
```

### Q4：Chrome / Edge 无法加载插件

请确认选择的是解压后的 `plugin` 文件夹，而不是 zip 文件，也不是上一级目录。

### Q5：岗位分析不准

最常见原因是岗位只有名称，没有完整 JD。请先在“当前岗位”区域补充岗位描述、岗位职责、任职要求、关键词，并点击“保存岗位要求库”。

### Q6：生成的话术不够精准

请检查：

1. 是否已保存岗位要求库。
2. 是否已重新点击“分析候选人”。
3. 候选人页面是否打开了在线简历或足够的右侧候选人信息。

### Q7：端口 8787 被占用

请关闭旧的服务窗口，或在任务管理器中结束旧的 Python 进程后再启动。

### Q8：换电脑后岗位要求库还在吗？

不在。岗位要求库保存在本机：

```text
local_server\data\recruit_assistant.db
```

如需迁移，可复制该数据库文件到新电脑相同目录。

---

## 13. 给分发人员的打包说明

如果你是分发内部试用包的人，请在代码目录执行：

```bat
python scripts\package_internal_trial.py
```

生成文件：

```text
release\AIRecruitAssistant-plugin-v0.1.0.zip
release\AIRecruitAssistant-internal-trial-v0.1.0.zip
```

请分发：

```text
release\AIRecruitAssistant-internal-trial-v0.1.0.zip
```

不要把 `release/*.zip` 提交到 Git；这些 zip 是本地生成物。
