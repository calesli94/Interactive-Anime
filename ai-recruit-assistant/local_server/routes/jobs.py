from fastapi import APIRouter, HTTPException

from crud import list_jobs, save_job
from models import JobSaveRequest

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/save")
def save_job_endpoint(payload: JobSaveRequest) -> dict:
    try:
        return save_job(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_jobs_endpoint() -> dict:
    return {"items": list_jobs()}
