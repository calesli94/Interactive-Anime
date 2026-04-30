from dataclasses import dataclass


@dataclass
class Settings:
    APP_NAME: str = "AI Recruit Assistant Local Server"
    HOST: str = "127.0.0.1"
    PORT: int = 8787
    DEBUG: bool = True


settings = Settings()
