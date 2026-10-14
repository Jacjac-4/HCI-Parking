"""User-entered prototype tickets; no external lookup or seeded records."""
from datetime import datetime, timezone
from decimal import Decimal
from threading import RLock
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

router = APIRouter()
TICKETS = []
REQUESTS = {}
lock = RLock()


class TicketRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    number: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9-]+$")
    amount: Decimal = Field(gt=0, le=9999.99, max_digits=6, decimal_places=2)
    reason: str = Field(min_length=1, max_length=500)
    request_id: UUID

    @field_validator("number")
    @classmethod
    def normalize_number(cls, value):
        return value.upper()


@router.get("/tickets")
def list_tickets(number: str | None = None):
    with lock:
        if number is None:
            return list(TICKETS)
        return [ticket for ticket in TICKETS if ticket["number"] == number.strip().upper()]


@router.post("/tickets")
def add_ticket(req: TicketRequest):
    with lock:
        key = str(req.request_id)
        payload = req.model_dump(mode="json")
        previous = REQUESTS.get(key)
        if previous:
            if previous["payload"] != payload:
                raise HTTPException(409, "Request ID already used for different ticket details")
            return previous["ticket"]
        if any(ticket["number"] == req.number for ticket in TICKETS):
            raise HTTPException(409, "This ticket number is already saved. Search for it to view its details.")
        ticket = {
            "id": f"TKT-{len(TICKETS) + 1:04d}",
            "number": req.number,
            "amount_cents": int(req.amount * 100),
            "reason": req.reason,
            "status": "unpaid",
            "source": "user_entered",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        TICKETS.append(ticket)
        REQUESTS[key] = {"payload": payload, "ticket": ticket}
        return ticket
