"""Windows 用户双击/命令行启动本地服务的入口。"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8787, reload=False)
