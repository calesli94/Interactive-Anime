from fastapi import APIRouter, HTTPException

from crud import list_jobs, save_job
from models import JobSaveRequest

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs_endpoint() -> list[dict]:
    return list_jobs()


@router.post("/save")
def save_job_endpoint(payload: JobSaveRequest) -> dict:
    try:
        result = save_job(payload)
        return {"ok": True, "job": result["job"], "job_id": result["job_id"], "action": result["action"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
