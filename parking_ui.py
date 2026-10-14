"""
parking_ui.py

NiceGUI parking portal with shared navigation and a task dashboard.
The permit pages currently use the starter purchase/cancel API;
guided applications and ticket processing will be added separately.

Run with:
    python -m pip install -r requirements.txt
    python parking_api.py     # in one terminal
    python parking_ui.py      # in another terminal

Then http://localhost:8082 will open automatically
"""

from urllib.parse import urlencode

import requests
from nicegui import ui

from portal_layout import PARKING_MAPS, action_link, heading, page_layout

API_BASE = "http://localhost:8003"

def api_get(path: str):
    try:
        resp = requests.get(f"{API_BASE}{path}", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        ui.notify(f"Could not reach API: {e}", type="negative")
        return []

def api_post(path: str, json: dict):
    try:
        resp = requests.post(f"{API_BASE}{path}", json=json, timeout=5)
        resp.raise_for_status()
        return True
    except requests.RequestException as e:
        detail = ""
        try:
            detail = e.response.json().get("detail", "")
        except Exception:
            pass
        ui.notify(detail or f"Request failed: {e}", type="negative")
        return False


def buy_permit(permit_type_id: int):
    if api_post("/permits/purchase", {"permit_type_id": permit_type_id}):
        ui.notify("Permit purchased", type="positive")
        render_portal.refresh()


def cancel_permit(permit_id: int):
    if api_post("/permits/cancel", {"permit_id": permit_id}):
        ui.notify("Permit cancelled", type="warning")
        render_portal.refresh()


@ui.page("/")
def main_page():
    with page_layout("/"):
        render_dashboard()


@ui.page("/permits")
def permits_page():
    with page_layout("/permits"):
        render_portal("permits")


@ui.page("/my-parking")
def my_parking_page():
    with page_layout("/my-parking"):
        render_portal("my-parking")


@ui.page("/lots")
def lots_page():
    with page_layout("/"):
        heading("Where can I park?")
        ui.label("These are sample lots. Capacity is not the number of empty spaces.")
        render_lots()
        render_announcements()
        ui.link("Official UNH campus parking maps", PARKING_MAPS, new_tab=True)


@ui.page("/tickets")
def tickets_page(ticket_number: str = ""):
    with page_layout("/tickets"):
        heading("Pay or appeal a ticket")
        if ticket_number:
            ui.label(f"Ticket number: {ticket_number}")
        ui.label("Ticket lookup, payment, and appeals are not available in this version yet.")
        action_link("Back to home", "/")


@ui.page("/help")
def help_page():
    with page_layout("/help"):
        heading("Parking help")
        ui.label("Browse sample permit options under Permits and purchased permits under My Parking.")
        ui.label("Guided parking help is not available in this version yet.")


def render_dashboard():
    with ui.column().classes("page-intro"):
        heading("My Parking")
        ui.label("Find a permit, check your status, or manage a ticket.").classes("page-description")
    with ui.element("div").classes("dashboard-grid"):
        with ui.card().classes("task-card"):
            heading("Get a parking permit", 2)
            with ui.element("ol").classes("permit-steps").props('aria-label="Permit application steps"'):
                for number, title in enumerate(("About you", "Permit", "Vehicle", "Review", "Confirmation"), 1):
                    with ui.element("li"):
                        ui.label(str(number)).classes("step-number")
                        ui.label(title)
            ui.label("See permit options, costs, and rules. Check your details before submitting.")
            ui.label("The guided application is not available yet; you can browse sample permits.").classes("support-copy")
            action_link("Find my permit", "/permits", primary=True)
        with ui.card().classes("task-card"):
            heading("My permit status", 2)
            ui.label("Application status unavailable").classes("status-note")
            ui.label("Application tracking is not connected yet. You can view purchased sample permits in My Parking.")
            ui.label("An application alone does not authorize parking.").classes("support-copy")
            action_link("View status and next steps", "/my-parking")
        with ui.card().classes("task-card"):
            heading("Where can I park?", 2)
            ui.label("Explore lot information and campus maps before choosing a permit.")
            with ui.element("div").classes("map-access"):
                ui.icon("map").props('aria-hidden="true"')
                ui.label("Campus parking maps and lot information")
            ui.label("Permit-specific coverage is not connected yet. A permit does not guarantee an open space.").classes("support-copy")
            action_link("View lots and map", "/lots")
        with ui.card().classes("task-card"):
            heading("Pay or appeal a ticket", 2)
            with ui.element("div").classes("ticket-search"):
                ticket = ui.input("Ticket number").props("outlined maxlength=40")

                def open_ticket():
                    number = (ticket.value or "").strip()
                    if not number:
                        ticket.error = "Enter a ticket number."
                        return
                    ui.navigate.to("/tickets?" + urlencode({"ticket_number": number}))

                ticket.on("keydown.enter", open_ticket)
                ui.button("Search", on_click=open_ticket).props("no-caps unelevated")
            ui.label("Ticket lookup is not connected yet. Your number will carry over to the ticket page.").classes("support-copy")
            ui.label("Review selected tickets and the total before paying. Keep your receipt.")


@ui.refreshable
def render_portal(page: str = "home"):
    if page == "permits":
        heading("Permits")
        render_permit_types()
        return
    if page == "my-parking":
        heading("My Parking")
        render_my_permits()
        return

    render_dashboard()


def render_lots():
    ui.label("Parking Lots").classes("text-lg")
    lots = api_get("/lots")
    for lot in lots:
        ui.label(f'{lot["name"]} ({lot["zone"]}) - {lot["type"]} - {lot["total_spaces"]} spaces - {lot["hours"]}')


def render_announcements():
    ui.label("Announcements").classes("text-lg")
    announcements = api_get("/announcements")
    for a in announcements:
        ui.label(a["title"])
        ui.label(a["body"])
        ui.separator()


def render_permit_types():
    ui.label("Buy a Permit").classes("text-lg")
    permit_types = api_get("/permit-types")
    for pt in permit_types:
        with ui.row().classes("items-center"):
            ui.label(
                f'{pt["name"]} - {pt["term"]} - ${pt["price"]} '
                f'- {pt["available"]}/{pt["capacity"]} available'
            )
            ui.button(
                "Buy Permit",
                on_click=lambda pt_id=pt["id"]: buy_permit(pt_id),
            )


def render_my_permits():
    ui.label("My Permits").classes("text-lg")
    my_permits = api_get("/my-permits")
    if not my_permits:
        ui.label("You don't have any permits yet.")
        return
    for p in my_permits:
        with ui.row().classes("items-center"):
            ui.label(f'{p["permit_type_name"]} - {p["zone"]} - ${p["price"]} - purchased {p["purchased"]}')
            ui.button(
                "Cancel",
                on_click=lambda permit_id=p["id"]: cancel_permit(permit_id),
            )


ui.run(port=8082, title="UNH Parking — Demo")
