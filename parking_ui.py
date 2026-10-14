"""
parking_ui.py

NiceGUI parking portal with shared navigation and a task dashboard.
Guided permit applications use the prototype API; ticket payments and appeals run inside the prototype.

Run with:
    python -m pip install -r requirements.txt
    python parking_api.py     # in one terminal
    python parking_ui.py      # in another terminal

Then open http://localhost:8082
"""

from urllib.parse import urlencode

from nicegui import ui
from parking_client import ApiError, request

from portal_layout import action_link, heading, page_layout
from permit_flow import render_applications, render_permit_flow
from ticket_flow import render_tickets
from unh_catalog import PERMIT_TYPES, COMMUTER_RULE

@ui.page("/")
async def main_page():
    with page_layout("/"):
        try:
            applications = await request("GET", "/applications")
            render_dashboard(applications)
        except ApiError:
            render_dashboard([], status_unavailable=True)


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
def lots_page(permit_id: int = 0):
    with page_layout("/"):
        heading("Where can I park?")
        render_lots(permit_id)


@ui.page("/tickets")
async def tickets_page(ticket_number: str = ""):
    with page_layout("/tickets"):
        await render_tickets(ticket_number)


@ui.page("/help")
def help_page():
    with page_layout("/help"):
        heading("Parking help")
        ui.label("Find student permit options under Permits and your saved information under My Parking.")
        with ui.expansion("How do I apply for a permit?").classes("w-full"):
            ui.label("Enter your student and residence information, choose a matching permit, add your vehicle, and review your details. Submit to receive an application confirmation.")
            action_link("Find my permit", "/permits")
        with ui.expansion("Does under review mean I can park?").classes("w-full"):
            ui.label("No. Under review means your application was received, not approved. It does not authorize parking. This course prototype does not issue real permits.")
            action_link("Check my applications", "/my-parking")
        with ui.expansion("Am I eligible for a commuter permit?").classes("w-full"):
            ui.label(COMMUTER_RULE)
        with ui.expansion("Where can I park with my permit?").classes("w-full"):
            ui.label("Choose your permit type to see its covered lots. Follow posted restrictions; a permit does not guarantee an open space.")
            action_link("Find covered lots", "/lots")
        with ui.expansion("How do I correct an application?").classes("w-full"):
            ui.label("Use Edit before submitting. After submitting, open My Parking, withdraw the incorrect application, and start a new one.")
            action_link("Manage applications", "/my-parking")


def render_dashboard(applications, status_unavailable=False):
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
            ui.label("Apply in five steps and track your application in My Parking.").classes("support-copy")
            action_link("Find my permit", "/permits", primary=True)
        with ui.card().classes("task-card"):
            heading("My permit status", 2)
            if status_unavailable:
                ui.label("Status temporarily unavailable").classes("status-note")
                ui.label("Open My Parking to retry. Your application may still be saved.")
            elif applications:
                latest = applications[-1]
                ui.label(latest["permit_type_name"])
                ui.label(latest["status"].replace("_", " ").upper()).classes("status-note")
                ui.label(latest["status_explanation"])
            else:
                ui.label("No applications yet").classes("status-note")
                ui.label("Start with Find my permit. Your submitted application's status will appear here.")
            ui.label("An application alone does not authorize parking.").classes("support-copy")
            action_link("View status and next steps", "/my-parking")
        with ui.card().classes("task-card"):
            heading("Where can I park?", 2)
            ui.label("Explore covered lots before choosing a permit.")
            with ui.element("div").classes("map-access"):
                ui.icon("map").props('aria-hidden="true"')
                ui.label("Campus lot information")
            ui.label("See the actual lots covered by each student permit. A permit does not guarantee an open space.").classes("support-copy")
            action_link("View covered lots", "/lots")
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
            ui.label("Search tickets you have entered, or open Tickets to add one.").classes("support-copy")
            ui.label("Select tickets, review their total, then pay or appeal. Keep your confirmation.")


def render_lots(permit_id=0):
    ui.label("Durham campus · Academic-year student permits")
    ui.label("Select a permit to see its published parking coverage. Follow posted signs and UNH parking regulations; this page does not show live space availability.")
    selection = ui.select({p["id"]: p["name"] for p in PERMIT_TYPES}, label="Permit type", value=permit_id if any(p["id"] == permit_id for p in PERMIT_TYPES) else None, on_change=lambda: coverage.refresh()).props("outlined").classes("w-full")

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



ui.run(host="127.0.0.1", port=8082, title="UNH Parking", show=False)
