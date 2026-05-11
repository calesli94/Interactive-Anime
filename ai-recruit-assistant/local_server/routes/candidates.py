from fastapi import APIRouter, HTTPException, Query

from crud import list_candidates, save_candidate, search_candidates
from models import CandidateSaveRequest

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.post("/save")
def save_candidate_endpoint(payload: CandidateSaveRequest) -> dict:
    try:
        return save_candidate(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_candidates_endpoint() -> dict:
    return {"items": list_candidates()}


@router.get("/search")
def search_candidates_endpoint(q: str = Query("")) -> dict:
    return {"items": search_candidates(q) if q.strip() else list_candidates()}
