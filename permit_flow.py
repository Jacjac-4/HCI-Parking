"""Five-step permit application; state belongs to this browser page."""
import re
from uuid import uuid4

from nicegui import ui

from parking_client import ApiError, request
from portal_layout import action_link, heading
from unh_catalog import COMMUTER_RULE, RESIDENCES, eligible

STEPS = ("About you", "Permit", "Vehicle", "Review", "Confirmation")


async def render_permit_flow():
    heading("Find my permit")
    loading = ui.label("Loading permit options…").props('role="status"')
    try:
        permits = await request("GET", "/permit-types")
    except ApiError as error:
        loading.set_text(str(error))
        action_link("Try again", "/permits")
        return
    loading.delete()
    applicant = {"name": "", "residence": None, "year": None, "commuter_eligible": False}
    vehicle = {"plate": "", "state": "", "vehicle_type": None}
    state = {"step": 0, "permit_id": None, "reviewed": False, "busy": False, "error": ""}
    pending_payload = None
    uncertain = False
    confirmation = None
    fields = []

    def selected_permit():
        return next((permit for permit in permits if permit["id"] == state["permit_id"]), None)

    def go(step):
        if state["busy"] or uncertain:
            return
        state.update(step=step, error="", reviewed=False)
        render.refresh()

    def advance():
        valid = [field.validate() for field in fields]
        if all(valid):
            go(state["step"] + 1)

    async def submit():
        nonlocal pending_payload, uncertain, confirmation
        if state["busy"] or confirmation:
            return
        if not state["reviewed"]:
            state["error"] = "Confirm that you reviewed the permit and vehicle details."
            render.refresh()
            return
        payload = {"applicant": dict(applicant), "permit_type_id": state["permit_id"], "vehicle": {
            "plate": vehicle["plate"].strip().upper(), "state": vehicle["state"].strip().upper(),
            "vehicle_type": vehicle["vehicle_type"],
        }}
        # Keep the ID and exact payload after an uncertain response so Retry is safe.
        if pending_payload is None or any(pending_payload[key] != value for key, value in payload.items()):
            pending_payload = {**payload, "request_id": str(uuid4())}
        state.update(busy=True, error="")
        render.refresh()
        try:
            confirmation = await request("POST", "/applications", pending_payload)
            state["step"] = 4
            uncertain = False
        except ApiError as error:
            uncertain = error.uncertain
            state["error"] = (
                "Submission could not be confirmed. Retry the same submission to recover its confirmation; "
                "your details are kept and editing is paused. " if uncertain else ""
            ) + str(error)
        finally:
            state["busy"] = False
            render.refresh()

    @ui.refreshable
    def render():
        fields.clear()
        step = state["step"]
        with ui.element("ol").classes("permit-steps").props('aria-label="Application progress"'):
            for index, title in enumerate(STEPS):
                with ui.element("li").props('aria-current="step"' if index == step else ""):
                    ui.label(str(index + 1)).classes("step-number")
                    ui.label(title).classes("font-bold" if index == step else "")
        with ui.card().classes("task-card w-full"):
            heading(f"Step {step + 1} of 5: {STEPS[step]}", 2)
            if state["error"]:
                ui.label(state["error"]).props('role="alert"').classes("text-red-800")
            if step == 0:
                ui.label("Enter your information to find student permit options. You can review everything before submitting.")
                fields.append(ui.input("Your name", validation={"Enter your name.": lambda v: bool((v or "").strip())})
                              .bind_value(applicant, "name").props("outlined maxlength=100").classes("w-full"))
                fields.append(ui.select(RESIDENCES, label="Where do you live?", validation={"Choose your residence.": lambda v: v in RESIDENCES})
                              .bind_value(applicant, "residence").props("outlined").classes("w-full"))
                fields.append(ui.select({"freshman": "Freshman", "continuing": "Sophomore, junior, senior, or graduate student"}, label="Student year",
                                        validation={"Choose your student year.": lambda v: v in ("freshman", "continuing")})
                              .bind_value(applicant, "year").props("outlined").classes("w-full"))
                ui.label(COMMUTER_RULE)
                ui.checkbox("I live off campus and meet all the commuter distance and residence requirements above.").bind_value(applicant, "commuter_eligible")
                action_link("Eligibility help", "/help")
            elif step == 1:
                choices = {p["id"]: f'{p["name"]} · ${p["price"]:.2f} · {p["term"]}'
                           for p in permits if eligible(p["id"], applicant)}
                fields.append(ui.select(choices, label="Permit", validation={"Choose a permit.": lambda v: v in choices})
                              .bind_value(state, "permit_id").props("outlined").classes("w-full"))
                if not choices:
                    ui.label("No academic-year student options match these answers. Review your answers or open Parking help for eligibility guidance.").props('role="status"')
                for permit in permits:
                    if permit["id"] not in choices:
                        continue
                    ui.label(f'{permit["name"]}: {permit["eligibility_reason"]} Requires a {permit["vehicle_requirement"]}.')

                ui.label("Options match your answers. Eligibility still needs review; submitting does not reserve a space. Resident and storage permits are limited and may require a lottery or waitlist. This prototype covers academic-year student permits.").classes("support-copy")
            elif step == 2:
                permit = selected_permit()
                ui.label(f'Selected: {permit["name"]} · Requires a {permit["vehicle_requirement"]}.')
                fields.append(ui.input("License plate", validation={
                    "Enter 1–10 letters, numbers, spaces, or hyphens.":
                        lambda v: bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 -]{0,9}", (v or "").strip()))
                }).bind_value(vehicle, "plate").props("outlined maxlength=10").classes("w-full"))
                fields.append(ui.input("State (two letters)", validation={
                    "Enter a two-letter state code.": lambda v: bool(re.fullmatch(r"[A-Za-z]{2}", (v or "").strip()))
                }).bind_value(vehicle, "state").props("outlined maxlength=2").classes("w-full"))
                fields.append(ui.select({"car": "Car", "motorcycle": "Motorcycle", "moped": "Moped"}, label="Vehicle type", validation={
                    f'This permit requires a {permit["vehicle_requirement"]}.': lambda v: v == permit["vehicle_requirement"]
                }).bind_value(vehicle, "vehicle_type").props("outlined").classes("w-full"))
            elif step == 3:
                permit = selected_permit()
                ui.label(f'{permit["name"]} · {permit["term"]} · ${permit["price"]:.2f}').classes("font-semibold")
                ui.label(f'Vehicle: {vehicle["plate"].strip().upper()} · {vehicle["state"].strip().upper()} · {vehicle["vehicle_type"]}')
                ui.label(f'Applicant: {applicant["name"]} · {RESIDENCES[applicant["residence"]]}')
                ui.label("Covered parking: " + ", ".join(permit["lots"]))
                ui.label("No payment is due when you submit this prototype application.")
                ui.label("Submit your application for review. You will receive a confirmation and can track it in My Parking. An application does not authorize parking.").classes("status-note")
                ui.checkbox("I reviewed the permit and vehicle details.").bind_value(state, "reviewed").set_enabled(not state["busy"] and not uncertain)
                with ui.row():
                    ui.button("Edit about you", on_click=lambda: go(0)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Edit permit", on_click=lambda: go(1)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Edit vehicle", on_click=lambda: go(2)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Retry submission" if uncertain else "Submit application", on_click=submit).props("no-caps unelevated").set_enabled(not state["busy"])
                if state["busy"]:
                    ui.label("Submitting your application…").props('role="status"')
            else:
                ui.label("Application received").classes("font-semibold").props('role="status"')
                ui.label(f'Confirmation: {confirmation["id"]}')
                ui.label(f'{confirmation["permit_type_name"]} · {confirmation["term"]}')
                ui.label(confirmation["status_explanation"]).classes("status-note")
                ui.label(confirmation["next_action"])
                action_link("View my application", "/my-parking", primary=True)
            if step < 3:
                with ui.row():
                    if step:
                        ui.button("Back", on_click=lambda: go(step - 1)).props("flat no-caps")
                    ui.button("Continue", on_click=advance).props("no-caps unelevated")
    render()


async def render_applications():
    """Show user-entered application status and available next actions."""
    heading("My applications", 2)
    ui.label("Applications remain under review in this prototype until you withdraw them. No real permits or approvals are issued.").classes("support-copy")
    content = ui.column().classes("w-full")

    async def refresh():
        content.clear()
        with content:
            try:
                applications = await request("GET", "/applications")
            except ApiError as error:
                ui.label(str(error)).props('role="alert"')
                ui.button("Try again", on_click=refresh).props("no-caps")
                return
            if not applications:
                ui.label("You have no applications yet.")
                action_link("Find my permit", "/permits")
            for application in reversed(applications):
                with ui.card().classes("task-card w-full"):
                    heading(application["permit_type_name"], 2)
                    ui.label(application["status"].replace("_", " ").upper()).classes("status-note")
                    ui.label(f'Confirmation: {application["id"]}')
                    ui.label(f'Applicant: {application["applicant"]["name"]}')
                    ui.label(f'Vehicle: {application["vehicle"]["plate"]} · {application["vehicle"]["state"]}')
                    ui.label(application["status_explanation"])
                    ui.label(application["next_action"])
                    action_link("View covered lots", f'/lots?permit_id={application["permit_type_id"]}')
                    if application["status"] == "under_review":
                        withdrawal_dialog(application, refresh)
                    else:
                        action_link("Start a new application", "/permits")
    await refresh()


def withdrawal_dialog(application, refresh):
    with ui.dialog() as dialog, ui.card():
        heading("Withdraw application?", 2)
        ui.label(f'Withdraw {application["id"]} for {application["permit_type_name"]}? You can submit a new application afterward.')
        error_label = ui.label("").props('role="alert"')

        async def withdraw():
            confirm.disable()
            try:
                await request("POST", f'/applications/{application["id"]}/withdraw')
            except ApiError as error:
                error_label.set_text(str(error) + " You can safely retry withdrawing this application.")
                confirm.enable()
                return
            dialog.close()
            await refresh()

        with ui.row():
            ui.button("Keep application", on_click=dialog.close).props("flat no-caps")
            confirm = ui.button("Confirm withdrawal", on_click=withdraw).props("no-caps")
    ui.button("Withdraw application", on_click=dialog.open).props("outline no-caps")
