from fastapi import APIRouter, HTTPException

from crud import list_matches, save_match
from models import MatchSaveRequest

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.post("/save")
def save_match_endpoint(payload: MatchSaveRequest) -> dict:
    try:
        return save_match(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_matches_endpoint() -> dict:
    return {"items": list_matches()}
