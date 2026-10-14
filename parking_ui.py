"""
parking_ui.py

NiceGUI parking portal with shared navigation and a task dashboard.
Guided permit planning uses a local API; ticket processing is still pending.

Run with:
    python -m pip install -r requirements.txt
    python parking_api.py     # in one terminal
    python parking_ui.py      # in another terminal

Then http://localhost:8082 will open automatically
"""

from urllib.parse import urlencode

from nicegui import ui

from portal_layout import PARKING_MAPS, action_link, heading, page_layout
from permit_flow import render_applications, render_permit_flow
from unh_catalog import PERMIT_TYPES, SOURCE, STORE

@ui.page("/")
def main_page():
    with page_layout("/"):
        render_dashboard()


@ui.page("/permits")
async def permits_page():
    with page_layout("/permits"):
        await render_permit_flow()


@ui.page("/my-parking")
async def my_parking_page():
    with page_layout("/my-parking"):
        heading("My Parking")
        await render_applications()


@ui.page("/lots")
def lots_page():
    with page_layout("/"):
        heading("Where can I park?")
        render_lots()
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
        ui.label("Find student permit options under Permits and your saved information under My Parking.")
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
            ui.label("Prepare your application in five steps, then complete your order with UNH.").classes("support-copy")
            action_link("Find my permit", "/permits", primary=True)
        with ui.card().classes("task-card"):
            heading("My permit status", 2)
            ui.label("Track your applications").classes("status-note")
            ui.label("View your saved application details and next steps. Check actual order status in the UNH permit store.")
            ui.label("An application alone does not authorize parking.").classes("support-copy")
            action_link("View status and next steps", "/my-parking")
        with ui.card().classes("task-card"):
            heading("Where can I park?", 2)
            ui.label("Explore lot information and campus maps before choosing a permit.")
            with ui.element("div").classes("map-access"):
                ui.icon("map").props('aria-hidden="true"')
                ui.label("Campus parking maps and lot information")
            ui.label("See the actual lots covered by each student permit. A permit does not guarantee an open space.").classes("support-copy")
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


def render_lots():
    ui.label("Durham campus · Academic-year student permits")
    ui.label("Select a permit to see its published parking coverage. Follow posted signs and UNH parking regulations; this page does not show live space availability.")
    selection = ui.select({p["id"]: p["name"] for p in PERMIT_TYPES}, label="Permit type", on_change=lambda: coverage.refresh()).props("outlined").classes("w-full")

    @ui.refreshable
    def coverage():
        permit = next((p for p in PERMIT_TYPES if p["id"] == selection.value), None)
        if not permit:
            ui.label("Choose your permit type to view covered lots.")
            return
        with ui.card().classes("task-card w-full"):
            heading(permit["name"], 2)
            for lot in permit["lots"]:
                ui.label(lot)
            ui.label(permit["eligibility_reason"])
    coverage()
    ui.label("Source checked October 14, 2026. Summer, visitor, and employee parking have different rules.").classes("support-copy")
    ui.link("UNH student permit rules and lot coverage", SOURCE, new_tab=True)
    ui.link("UNH permit store: availability and orders", STORE, new_tab=True)


ui.run(host="127.0.0.1", port=8082, title="UNH Parking", show=False)
