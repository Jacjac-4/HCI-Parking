"""Ticket entry, exact-number search, and a visible selection summary."""
import re
from uuid import uuid4

from nicegui import ui

from parking_client import ApiError, request
from portal_layout import heading
from ticket_actions import money, review_action, show_confirmation


def valid_amount(value):
    return bool(re.fullmatch(r'(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{1,2})?', (value or '').strip())) and float(value) > 0


async def render_tickets(ticket_number=""):
    heading("Pay or appeal a ticket")
    ui.label("Enter your ticket details, then search and select tickets to review their total.")
    ui.label("Only tickets you enter appear here. Records reset when the server restarts. Payments and appeals affect this prototype only.").classes("support-copy")
    tickets = []
    selected = {}
    load_error = ""
    loaded = False
    query = ticket_number.strip().upper()

    with ui.row().classes("w-full items-start"):
        search = ui.input("Ticket number", value=ticket_number).props("outlined maxlength=40").classes("grow")

        def apply_search():
            nonlocal query
            query = (search.value or "").strip().upper()
            results.refresh()

        def show_all():
            search.set_value("")
            apply_search()

        search.on("keydown.enter", apply_search)
        ui.button("Search", on_click=apply_search).props("no-caps unelevated")
        ui.button("Show all tickets", on_click=show_all).props("flat no-caps")

    async def reload_tickets():
        nonlocal tickets, load_error, loaded
        try:
            tickets = await request("GET", "/tickets")
            loaded = True
            load_error = ""
            current = {t["id"]: t for t in tickets if t["status"] == "unpaid"}
            for key in list(selected):
                if key not in current:
                    selected.pop(key)
                else:
                    selected[key] = current[key]
        except ApiError as error:
            load_error = str(error)
        results.refresh()
        summary.refresh()

    async def action_complete():
        selected.clear()
        await reload_tickets()

    def toggle(ticket, checked):
        if checked:
            selected[ticket["id"]] = ticket
        else:
            selected.pop(ticket["id"], None)
        summary.refresh()

    def clear_selection():
        selected.clear()
        results.refresh()
        summary.refresh()

    @ui.refreshable
    def summary():
        with ui.card().classes("task-card w-full"):
            heading("Selected tickets", 2)
            ui.label(f'{len(selected)} selected · Total {money(sum(t["amount_cents"] for t in selected.values()))}').classes("status-note").props('role="status" aria-live="polite"')
            for ticket in selected.values():
                ui.label(f'{ticket["number"]} · {money(ticket["amount_cents"])}')
            if selected:
                ui.label("Your selection includes the tickets listed here, even when search hides them.").classes("support-copy")
                with ui.row():
                    ui.button("Pay selected", on_click=lambda: review_action("pay", list(selected.values()), action_complete)).props("no-caps unelevated").set_enabled(not load_error)
                    ui.button("Appeal selected", on_click=lambda: review_action("appeal", list(selected.values()), action_complete)).props("outline no-caps").set_enabled(not load_error)
                    ui.button("Clear selection", on_click=clear_selection).props("flat no-caps")

    @ui.refreshable
    def results():
        if load_error:
            ui.label(load_error).props('role="alert"')
            ui.button("Retry loading tickets", on_click=reload_tickets).props("no-caps")
            return
        if not loaded:
            ui.label("Loading tickets…").props('role="status"')
            return
        matches = [t for t in tickets if not query or t["number"] == query]
        if not matches:
            ui.label(f'No saved ticket matches “{query}”. Check the number or add its details below.' if query else "No tickets yet. Add your first ticket below.").props('role="status"')
        for ticket in matches:
            with ui.card().classes("task-card w-full"):
                if ticket["status"] == "unpaid":
                    ui.checkbox(f'Select ticket {ticket["number"]}', value=ticket["id"] in selected,
                                on_change=lambda e, t=ticket: toggle(t, e.value))
                heading(f'Ticket {ticket["number"]}', 2)
                ui.label(f'{money(ticket["amount_cents"])} · {ticket["status"].replace("_", " ").title()}')
                ui.label(ticket["reason"])
                ui.label("Entered by you").classes("support-copy")
                if ticket.get("confirmation"):
                    ui.button("View confirmation", on_click=lambda t=ticket: show_confirmation(t["confirmation"])).props("outline no-caps")

    results()
    summary()

    with ui.dialog().props("persistent") as dialog, ui.card().classes("w-full max-w-lg"):
        heading("Add a ticket", 2)
        ui.label("Enter the details from your ticket. This does not create or verify a UNH citation.")
        number = ui.input("Ticket number to add", validation={"Enter 1–40 letters, numbers, or hyphens.": lambda v: bool(re.fullmatch(r'[A-Za-z0-9-]{1,40}', (v or '').strip()))}).props("outlined maxlength=40").classes("w-full")
        amount = ui.input("Amount ($)", validation={"Enter an amount from $0.01 to $9,999.99 with at most two decimal places.": valid_amount}).props('outlined inputmode="decimal"').classes("w-full")
        reason = ui.textarea("Ticket reason", validation={"Enter the ticket reason.": lambda v: bool((v or '').strip())}).props("outlined maxlength=500").classes("w-full")
        error_label = ui.label("").props('role="alert"')
        pending = None
        uncertain = False
        busy = False

        async def save():
            nonlocal pending, uncertain, busy, query
            if busy:
                return
            if not all([field.validate() for field in (number, amount, reason)]):
                return
            if not uncertain:
                pending = {"number": number.value.strip().upper(), "amount": amount.value.strip(),
                           "reason": reason.value.strip(), "request_id": str(uuid4())}
            busy = True
            for control in (number, amount, reason, cancel, save_button):
                control.disable()
            error_label.set_text("")
            try:
                ticket = await request("POST", "/tickets", pending)
            except ApiError as error:
                uncertain = error.uncertain
                error_label.set_text(("Saving could not be confirmed. Retry with the same details. " if uncertain else "") + str(error))
            else:
                uncertain = False
                pending = None
                dialog.close()
                search.set_value(ticket["number"])
                query = ticket["number"]
                await reload_tickets()
                ui.notify("Ticket saved", type="positive")
            finally:
                busy = False
                save_button.enable()
                save_button.set_text("Retry saving" if uncertain else "Save ticket")
                for control in (number, amount, reason, cancel):
                    control.set_enabled(not uncertain)

        with ui.row():
            cancel = ui.button("Cancel", on_click=dialog.close).props("flat no-caps")
            save_button = ui.button("Save ticket", on_click=save).props("no-caps unelevated")

    def open_add():
        number.set_value(query)
        amount.set_value("")
        reason.set_value("")
        error_label.set_text("")
        for field in (number, amount, reason):
            field.error = None
        dialog.open()

    ui.button("Add a ticket", icon="add", on_click=open_add).props("no-caps unelevated")
    await reload_tickets()
