from fastapi import APIRouter, HTTPException, Query

from crud import list_candidates, save_candidate, search_candidates
from models import CandidateSaveRequest

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


@router.get("")
def list_candidates_endpoint() -> list[dict]:
    return list_candidates()


@router.post("/save")
def save_candidate_endpoint(payload: CandidateSaveRequest) -> dict:
    try:
        result = save_candidate(payload)
        return {"ok": True, "candidate": result["candidate"], "candidate_id": result["candidate_id"], "action": result["action"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/search")
def search_candidates_endpoint(q: str = Query("")) -> list[dict]:
    return search_candidates(q) if q.strip() else list_candidates()
