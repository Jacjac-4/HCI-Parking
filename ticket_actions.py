"""Review and confirm prototype payments and appeals without leaving the app."""
from uuid import uuid4

from nicegui import ui

from parking_client import ApiError, request
from portal_layout import heading


def money(cents):
    return f'${cents // 100:,}.{cents % 100:02d}'


def receipt_text(confirmation):
    lines = ["UNH Parking — Course prototype", "No money charged; no real citation paid or appealed.",
             f'Confirmation: {confirmation["id"]}', f'Action: {confirmation["action"]}',
             f'Date: {confirmation["created_at"]}', ""]
    lines += [f'{t["number"]}: {money(t["amount_cents"])}' for t in confirmation["tickets"]]
    lines += [f'Total: {money(confirmation["total_cents"])}']
    if confirmation["explanation"]:
        lines += ["", "Appeal explanation:", confirmation["explanation"]]
    return '\n'.join(lines) + '\n'


def show_confirmation(confirmation):
    with ui.context.client.content, ui.dialog() as dialog, ui.card().classes("w-full max-w-lg"):
        heading("Payment confirmation" if confirmation["action"] == "pay" else "Appeal received", 2)
        ui.label(f'Confirmation: {confirmation["id"]}').props('role="status"')
        for ticket in confirmation["tickets"]:
            ui.label(f'{ticket["number"]} · {money(ticket["amount_cents"])}')
        ui.label(f'Total: {money(confirmation["total_cents"])}').classes("status-note")
        if confirmation["action"] == "appeal":
            ui.label("Appeal pending. Your explanation is saved with these tickets.")
            ui.label(confirmation["explanation"])
        else:
            ui.label("These tickets are marked paid in the prototype.")
        ui.label("Prototype confirmation only. No money was charged and no real citation was paid or appealed.").classes("support-copy")
        ui.button("Download confirmation", on_click=lambda: ui.download(
            receipt_text(confirmation).encode(), filename=f'{confirmation["id"]}.txt')).props("outline no-caps")
        ui.button("Done", on_click=dialog.close).props("no-caps")
    dialog.open()


def review_action(action, tickets, on_complete):
    # Snapshot the selection so a filtered view cannot change what is confirmed.
    chosen = [dict(ticket) for ticket in tickets]
    total = sum(ticket["amount_cents"] for ticket in chosen)
    pending = None
    busy = False
    uncertain = False
    with ui.context.client.content, ui.dialog().props("persistent") as dialog, ui.card().classes("w-full max-w-lg"):
        heading("Review payment" if action == "pay" else "Review appeal", 2)
        for ticket in chosen:
            ui.label(f'{ticket["number"]} · {money(ticket["amount_cents"])}')
        ui.label(f'{len(chosen)} selected · Total {money(total)}').classes("status-note")
        ui.label("This action updates the prototype only. No money is charged or real citation changed.")
        explanation = None
        if action == "appeal":
            explanation = ui.textarea("Appeal explanation", validation={
                "Explain why you are appealing.": lambda v: bool((v or '').strip())
            }).props("outlined maxlength=2000").classes("w-full")
        reviewed = ui.checkbox("I reviewed the selected tickets and total.")
        error_label = ui.label("").props('role="alert"')

        async def confirm():
            nonlocal pending, busy, uncertain
            if busy:
                return
            if not reviewed.value:
                error_label.set_text("Review the tickets and total, then check the confirmation box.")
                return
            if explanation is not None and not explanation.validate():
                return
            if not uncertain:
                pending = dict(action=action, ticket_ids=[t['id'] for t in chosen],
                               expected_total_cents=total, explanation=explanation.value.strip() if explanation else '',
                               request_id=str(uuid4()))
            busy = True
            controls = [reviewed, cancel, submit] + ([explanation] if explanation is not None else [])
            for control in controls:
                control.disable()
            error_label.set_text("")
            try:
                confirmation = await request("POST", "/ticket-actions", pending)
            except ApiError as error:
                uncertain = error.uncertain
                error_label.set_text(("The result could not be confirmed. Retry this same action. " if uncertain else "") + str(error))
            else:
                uncertain = False
                dialog.close()
                await on_complete()
                show_confirmation(confirmation)
            finally:
                busy = False
                for control in controls:
                    control.set_enabled(not uncertain)
                submit.enable()
                submit.set_text("Retry confirmation" if uncertain else ("Confirm prototype payment" if action == "pay" else "Submit appeal"))

        with ui.row():
            cancel = ui.button("Back to tickets", on_click=dialog.close).props("flat no-caps")
            submit = ui.button("Confirm prototype payment" if action == "pay" else "Submit appeal", on_click=confirm).props("no-caps unelevated")
    dialog.open()
