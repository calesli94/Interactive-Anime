"""Recruitment asset API route registration."""

from fastapi import FastAPI

from routes.candidates import router as candidates_router
from routes.jobs import router as jobs_router
from routes.matches import router as matches_router

ASSET_ROUTE_PATHS = {
    "/api/candidates",
    "/api/candidates/save",
    "/api/candidates/search",
    "/api/jobs",
    "/api/jobs/save",
    "/api/matches",
    "/api/matches/save",
}


def register_asset_routes(app: FastAPI) -> None:
    """Register local recruitment asset APIs exactly once."""
    existing = {route.path for route in app.routes}
    if "/api/candidates" not in existing:
        app.include_router(candidates_router)
    existing = {route.path for route in app.routes}
    if "/api/jobs" not in existing:
        app.include_router(jobs_router)
    existing = {route.path for route in app.routes}
    if "/api/matches" not in existing:
        app.include_router(matches_router)


def assert_asset_routes_registered(app: FastAPI) -> None:
    registered = {route.path for route in app.routes}
    missing = sorted(ASSET_ROUTE_PATHS - registered)
    if missing:
        raise RuntimeError(f"Recruitment asset routes not registered: {', '.join(missing)}")
