"""Windows executable entrypoint for AI Recruit Assistant local server."""

import uvicorn

from config import settings


def main() -> None:
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=False)


if __name__ == "__main__":
    main()
