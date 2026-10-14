"""
parking_api.py

A mock backend for a campus parking permit portal: browse lots,
see permit types and availability, purchase/cancel a permit, and read
parking announcements (closures, construction, etc).

Run with:
    python -m pip install -r requirements.txt
    python parking_api.py

API is available at http://localhost:8003

Endpoints:
    GET  /lots
    GET  /lots/{lot_id}
    GET  /permit-types
    GET  /permit-types/{permit_type_id}
    GET  /my-permits
    POST /permits/purchase   body: {"permit_type_id": int}
    POST /permits/cancel     body: {"permit_id": int}
    GET  /announcements
    GET  /profile
    GET  /applications
    GET  /applications/{application_id}
    POST /applications       body: {"permit_type_id": int, "vehicle": {...}, "request_id": UUID}
"""

from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="Mock Parking Permit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NOW = datetime(2026, 8, 23, 9, 0, 0)

def _iso(days_offset: int) -> str:
    return (NOW + timedelta(days=days_offset)).isoformat()


# ---------------------------------------------------------------------
# In-memory "database"
# ---------------------------------------------------------------------

LOTS = [
    {"id": 1, "name": "North Garage", "zone": "Zone A", "type": "student", "total_spaces": 400, "hours": "24/7"},
    {"id": 2, "name": "Library Lot", "zone": "Zone B", "type": "student", "total_spaces": 150, "hours": "7am-11pm"},
    {"id": 3, "name": "Faculty Row", "zone": "Zone C", "type": "faculty", "total_spaces": 90, "hours": "24/7"},
    {"id": 4, "name": "Visitor Circle", "zone": "Zone D", "type": "visitor", "total_spaces": 40, "hours": "8am-6pm"},
    {"id": 5, "name": "South Commuter Lot", "zone": "Zone A", "type": "student", "total_spaces": 250, "hours": "6am-1am"},
]

PERMIT_TYPES = [
    {"id": 1, "name": "Student - Zone A", "zone": "Zone A", "term": "Fall 2026", "price": 210, "capacity": 600},
    {"id": 2, "name": "Student - Zone B", "zone": "Zone B", "term": "Fall 2026", "price": 180, "capacity": 150},
    {"id": 3, "name": "Faculty/Staff - Zone C", "zone": "Zone C", "term": "Fall 2026", "price": 320, "capacity": 90},
    {"id": 4, "name": "Visitor Day Pass - Zone D", "zone": "Zone D", "term": "Single day", "price": 8, "capacity": 40},
    {"id": 5, "name": "Motorcycle - Any Zone", "zone": "Any Zone", "term": "Fall 2026", "price": 60, "capacity": 50},
]

# Purchased permits for the (demo) logged-in user.
# Pre-seeded with one existing purchase so the portal doesn't start empty.
MY_PERMITS = [
    {"id": 1, "permit_type_id": 2, "purchased": _iso(-10)},
]
_next_permit_id = 2

# Fictional single-user scenario, not UNH eligibility policy. Restarting resets it.
PROFILE = {
    "id": "demo-student",
    "name": "Alex Student",
    "category": "commuter",
    "vehicle": {"plate": "DEMO123", "state": "NH", "vehicle_type": "car"},
}
APPLICATIONS = []
APPLICATION_REQUESTS = {}
application_lock = RLock()

ANNOUNCEMENTS = [
    {
        "id": 1,
        "title": "Library Lot construction starting Monday",
        "posted": _iso(-2),
        "body": "The east half of Library Lot will be closed for resurfacing starting Monday through the end of the month. Permit holders should use North Garage as an alternate.",
    },
    {
        "id": 2,
        "title": "Visitor Circle rate change",
        "posted": _iso(-6),
        "body": "Visitor day passes increase to $8/day starting this term to match neighboring campus lots.",
    },
]


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------

class PurchaseRequest(BaseModel):
    permit_type_id: int


class CancelRequest(BaseModel):
    permit_id: int


class Vehicle(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, str_to_upper=True, extra="forbid")

    plate: str = Field(min_length=1, max_length=10, pattern=r"^[A-Za-z0-9][A-Za-z0-9 -]*$")
    state: str = Field(pattern=r"^[A-Za-z]{2}$")
    vehicle_type: Literal["car", "motorcycle"]


class ApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    permit_type_id: int = Field(gt=0, strict=True)
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


def _sold_count(permit_type_id: int) -> int:
    return sum(1 for p in MY_PERMITS if p["permit_type_id"] == permit_type_id)


def _summarize_permit_type(pt: dict) -> dict:
    sold = _sold_count(pt["id"])
    summary = dict(pt)
    summary["sold"] = sold
    summary["available"] = pt["capacity"] - sold
    summary["eligible"] = pt["id"] != 3
    summary["eligibility_reason"] = (
        "This sample permit requires a faculty/staff profile."
        if pt["id"] == 3 else "Available to the demo commuter profile."
    )
    summary["vehicle_requirement"] = "motorcycle" if pt["id"] == 5 else "car"
    return summary


@app.get("/profile")
def get_profile():
    return PROFILE


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

        permit = _summarize_permit_type(_get_permit_type_or_404(req.permit_type_id))
        if not permit["eligible"]:
            raise HTTPException(status_code=403, detail=permit["eligibility_reason"])
        if req.vehicle.vehicle_type != permit["vehicle_requirement"]:
            raise HTTPException(status_code=422, detail=f'This permit requires a {permit["vehicle_requirement"]}.')
        if permit["available"] <= 0:
            raise HTTPException(status_code=409, detail="This sample permit is sold out")
        for existing in APPLICATIONS:
            if (existing["permit_type_id"] == req.permit_type_id
                    and existing["vehicle"]["plate"] == req.vehicle.plate
                    and existing["vehicle"]["state"] == req.vehicle.state
                    and existing["status"] == "under_review"):
                raise HTTPException(status_code=409, detail="An application for this permit and vehicle is already under review")

        application = {
            "id": f"APP-{len(APPLICATIONS) + 1:04d}",
            "profile_id": PROFILE["id"],
            "permit_type_id": permit["id"],
            "permit_type_name": permit["name"],
            "term": permit["term"],
            "price": permit["price"],
            "vehicle": req.vehicle.model_dump(),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "status": "under_review",
            "authorization": "not_valid",
            "status_explanation": "Application received; not yet approved. This application does not authorize parking.",
            "next_action": "Check My Parking for status. This demo does not process real approvals.",
            "permit_id": None,
        }
        APPLICATIONS.append(application)
        APPLICATION_REQUESTS[request_id] = {"payload": payload, "application": application}
        return application


@app.get("/lots")
def list_lots():
    return LOTS


@app.get("/lots/{lot_id}")
def get_lot(lot_id: int):
    return _get_lot_or_404(lot_id)


@app.get("/permit-types")
def list_permit_types():
    return [_summarize_permit_type(pt) for pt in PERMIT_TYPES]


@app.get("/permit-types/{permit_type_id}")
def get_permit_type(permit_type_id: int):
    return _summarize_permit_type(_get_permit_type_or_404(permit_type_id))


@app.get("/my-permits")
def get_my_permits():
    enriched = []
    for p in MY_PERMITS:
        pt = _get_permit_type_or_404(p["permit_type_id"])
        enriched.append({**p, "permit_type_name": pt["name"], "zone": pt["zone"], "price": pt["price"]})
    return enriched


@app.get("/announcements")
def list_announcements():
    return ANNOUNCEMENTS


@app.post("/permits/purchase")
def purchase_permit(req: PurchaseRequest):
    global _next_permit_id
    pt = _get_permit_type_or_404(req.permit_type_id)
    if _sold_count(pt["id"]) >= pt["capacity"]:
        raise HTTPException(status_code=400, detail=f'{pt["name"]} is sold out')

    new_permit = {
        "id": _next_permit_id,
        "permit_type_id": pt["id"],
        "purchased": NOW.isoformat(),
    }
    MY_PERMITS.append(new_permit)
    _next_permit_id += 1
    return new_permit


@app.post("/permits/cancel")
def cancel_permit(req: CancelRequest):
    for i, p in enumerate(MY_PERMITS):
        if p["id"] == req.permit_id:
            MY_PERMITS.pop(i)
            return {"cancelled": req.permit_id}
    raise HTTPException(status_code=404, detail="Permit not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
