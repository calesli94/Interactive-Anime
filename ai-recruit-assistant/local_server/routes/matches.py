from fastapi import APIRouter, HTTPException

from crud import list_matches, save_match
from models import MatchSaveRequest

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("")
def list_matches_endpoint() -> list[dict]:
    return list_matches()


@router.post("/save")
def save_match_endpoint(payload: MatchSaveRequest) -> dict:
    try:
        result = save_match(payload)
        return {"ok": True, "match": result["match"], "match_id": result["match_id"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
