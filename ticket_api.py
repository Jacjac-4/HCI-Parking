"""User-entered prototype tickets; no external lookup or seeded records."""
from datetime import datetime, timezone
from decimal import Decimal
from threading import RLock
from typing import Literal
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


ACTIONS = {}


class TicketAction(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    ticket_ids: list[str] = Field(min_length=1, max_length=50)
    action: Literal["pay", "appeal"]
    expected_total_cents: int = Field(gt=0, strict=True)
    explanation: str = Field(default="", max_length=2000)
    request_id: UUID

    @field_validator("ticket_ids")
    @classmethod
    def distinct_tickets(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Select each ticket only once")
        return sorted(value)


@router.post("/ticket-actions")
def resolve_tickets(req: TicketAction):
    """Atomic prototype action, with no payment processor or external submission."""
    with lock:
        key = str(req.request_id)
        payload = req.model_dump(mode="json")
        if key in ACTIONS:
            previous = ACTIONS[key]
            if previous["payload"] != payload:
                raise HTTPException(409, "Request ID already used for a different action")
            return previous["confirmation"]
        if req.action == "appeal" and not req.explanation:
            raise HTTPException(422, "Enter an explanation for your appeal")
        chosen = [ticket for ticket in TICKETS if ticket["id"] in req.ticket_ids]
        if len(chosen) != len(req.ticket_ids):
            raise HTTPException(404, "A selected ticket could not be found. Refresh your tickets.")
        if any(ticket["status"] != "unpaid" for ticket in chosen):
            raise HTTPException(409, "A selected ticket has already been paid or appealed. Refresh your tickets.")
        total = sum(ticket["amount_cents"] for ticket in chosen)
        if total != req.expected_total_cents:
            raise HTTPException(409, "The ticket total has changed. Refresh and review the total again.")
        confirmation = {
            "id": f"{'PAY' if req.action == 'pay' else 'APL'}-{len(ACTIONS) + 1:04d}",
            "action": req.action,
            "tickets": [{k: t[k] for k in ('id', 'number', 'amount_cents')} for t in chosen],
            "total_cents": total,
            "explanation": req.explanation if req.action == 'appeal' else '',
            "created_at": datetime.now(timezone.utc).isoformat(),
            "prototype": True,
        }
        for ticket in chosen:
            ticket["status"] = "paid" if req.action == "pay" else "appeal_pending"
            ticket["confirmation"] = confirmation
        ACTIONS[key] = {"payload": payload, "confirmation": confirmation}
        return confirmation
