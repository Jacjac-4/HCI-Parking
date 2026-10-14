"""Local single-user prototype. Starts empty; no real permit transactions."""
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from unh_catalog import LOTS, PERMIT_TYPES, eligible

app = FastAPI(title="Parking prototype")
APPLICATIONS = []
APPLICATION_REQUESTS = {}
application_lock = RLock()


class Applicant(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    residence: Literal["off_campus", "gables", "woodside", "north", "south"]
    year: Literal["freshman", "continuing"]
    commuter_eligible: bool = Field(strict=True)


class Vehicle(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, str_to_upper=True, extra="forbid")

    plate: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9][A-Za-z0-9 -]*$")
    state: str = Field(pattern=r"^[A-Za-z]{2}$")
    vehicle_type: Literal["car", "motorcycle", "moped"]


class ApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permit_type_id: int = Field(gt=0, strict=True)
    applicant: Applicant
    vehicle: Vehicle
    request_id: UUID


def _get_lot_or_404(lot_id: int) -> dict:
    for lot in LOTS:
        if lot["id"] == lot_id:
            return lot
    raise HTTPException(status_code=404, detail="Lot not found")


def _get_permit_type_or_404(permit_type_id: int) -> dict:
    for pt in PERMIT_TYPES:
        if pt["id"] == permit_type_id:
            return pt
    raise HTTPException(status_code=404, detail="Permit type not found")


@app.get("/applications")
def list_applications():
    return APPLICATIONS


@app.get("/applications/{application_id}")
def get_application(application_id: str):
    for application in APPLICATIONS:
        if application["id"] == application_id:
            return application
    raise HTTPException(status_code=404, detail="Application not found")


@app.post("/applications")
def submit_application(req: ApplicationRequest):
    # A retry with the same request ID returns the original confirmation.
    # The lock prevents simultaneous requests from creating duplicate records.
    with application_lock:
        request_id = str(req.request_id)
        payload = req.model_dump(mode="json")
        previous = APPLICATION_REQUESTS.get(request_id)
        if previous:
            if previous["payload"] != payload:
                raise HTTPException(status_code=409, detail="Request ID already used for different details")
            return previous["application"]

        permit = _get_permit_type_or_404(req.permit_type_id)
        if not eligible(permit["id"], req.applicant.model_dump()):
            raise HTTPException(status_code=403, detail=permit["eligibility_reason"])
        if req.vehicle.vehicle_type != permit["vehicle_requirement"]:
            raise HTTPException(status_code=422, detail=f'This permit requires a {permit["vehicle_requirement"]}.')
        for existing in APPLICATIONS:
            if (existing["permit_type_id"] == req.permit_type_id
                    and existing["vehicle"]["plate"] == req.vehicle.plate
                    and existing["vehicle"]["state"] == req.vehicle.state
                    and existing["status"] == "under_review"):
                raise HTTPException(status_code=409, detail="An application for this permit and vehicle is already under review")

        application = {
            "id": f"APP-{len(APPLICATIONS) + 1:04d}",
            "applicant": req.applicant.model_dump(),
            "permit_type_id": permit["id"],
            "permit_type_name": permit["name"],
            "term": permit["term"],
            "price": permit["price"],
            "vehicle": req.vehicle.model_dump(),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "status": "under_review",
            "authorization": "not_valid",
            "status_explanation": "Application received; not yet approved. This application does not authorize parking.",
            "next_action": "Review your application details in My Parking. You can withdraw an incorrect application and submit a corrected one.",
            "permit_id": None,
        }
        APPLICATIONS.append(application)
        APPLICATION_REQUESTS[request_id] = {"payload": payload, "application": application}
        return application


@app.post("/applications/{application_id}/withdraw")
def withdraw_application(application_id: str):
    with application_lock:
        application = get_application(application_id)
        if application["status"] == "withdrawn":
            return application
        if application["status"] != "under_review":
            raise HTTPException(status_code=409, detail="Only pending applications can be withdrawn")
        application.update(
            status="withdrawn",
            status_explanation="Application withdrawn. This application does not authorize parking.",
            next_action="Start a new application if you still need a permit.",
        )
        return application


@app.get("/lots")
def list_lots():
    return LOTS


@app.get("/lots/{lot_id}")
def get_lot(lot_id: int):
    return _get_lot_or_404(lot_id)


@app.get("/permit-types")
def list_permit_types():
    return PERMIT_TYPES


@app.get("/permit-types/{permit_type_id}")
def get_permit_type(permit_type_id: int):
    return _get_permit_type_or_404(permit_type_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8003)
