"""Five-step permit application; state belongs to this browser page."""
import re
from uuid import uuid4

from nicegui import ui

from parking_client import ApiError, request
from portal_layout import action_link, heading
from unh_catalog import COMMUTER_RULE, RESIDENCES, SOURCE, STORE, eligible

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
                ui.label("Enter your information to find student permit options. Saved records stay in this local session until the server restarts.")
                fields.append(ui.input("Your name", validation={"Enter your name.": lambda v: bool((v or "").strip())})
                              .bind_value(applicant, "name").props("outlined maxlength=100").classes("w-full"))
                fields.append(ui.select(RESIDENCES, label="Where do you live?", validation={"Choose your residence.": lambda v: v in RESIDENCES})
                              .bind_value(applicant, "residence").props("outlined").classes("w-full"))
                fields.append(ui.select({"freshman": "Freshman", "continuing": "Sophomore, junior, senior, or graduate student"}, label="Student year",
                                        validation={"Choose your student year.": lambda v: v in ("freshman", "continuing")})
                              .bind_value(applicant, "year").props("outlined").classes("w-full"))
                ui.label(COMMUTER_RULE)
                ui.checkbox("I live off campus and meet all the commuter distance and residence requirements above.").bind_value(applicant, "commuter_eligible")
                ui.link("Check UNH eligibility rules", SOURCE, new_tab=True)
            elif step == 1:
                choices = {p["id"]: f'{p["name"]} · ${p["price"]:.2f} · {p["term"]}'
                           for p in permits if eligible(p["id"], applicant)}
                fields.append(ui.select(choices, label="Permit", validation={"Choose a permit.": lambda v: v in choices})
                              .bind_value(state, "permit_id").props("outlined").classes("w-full"))
                if not choices:
                    ui.label("No academic-year student options match these answers. Contact Parking Services to discuss your circumstances.").props('role="status"')
                for permit in permits:
                    ui.label(f'{permit["name"]}: {permit["eligibility_reason"]} Requires a {permit["vehicle_requirement"]}.')

                ui.label("Published academic-year student options, checked October 14, 2026. UNH verifies eligibility; sign in to its store for availability, lotteries, and waitlists. Student online orders add a $3.95 processing fee. Summer and employee options are available through UNH.").classes("support-copy")
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
                ui.label("Published price plus $3.95 online processing fee. No payment is collected here.")
                ui.label("Save your details locally, then order through the official UNH store. Saving here does not submit an order to UNH.").classes("status-note")
                ui.checkbox("I reviewed the permit and vehicle details.").bind_value(state, "reviewed").set_enabled(not state["busy"] and not uncertain)
                with ui.row():
                    ui.button("Edit about you", on_click=lambda: go(0)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Edit permit", on_click=lambda: go(1)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Edit vehicle", on_click=lambda: go(2)).props("flat no-caps").set_enabled(not state["busy"] and not uncertain)
                    ui.button("Retry submission" if uncertain else "Save application", on_click=submit).props("no-caps unelevated").set_enabled(not state["busy"])
                if state["busy"]:
                    ui.label("Submitting your application…").props('role="status"')
            else:
                ui.label("Application saved locally").classes("font-semibold").props('role="status"')
                ui.label(f'Confirmation: {confirmation["id"]}')
                ui.label(f'{confirmation["permit_type_name"]} · {confirmation["term"]}')
                ui.label(confirmation["status_explanation"]).classes("status-note")
                ui.label(confirmation["next_action"])
                ui.link("Continue to UNH permit store", STORE, new_tab=True)
                action_link("View my application", "/my-parking", primary=True)
            if step < 3:
                with ui.row():
                    if step:
                        ui.button("Back", on_click=lambda: go(step - 1)).props("flat no-caps")
                    ui.button("Continue", on_click=advance).props("no-caps unelevated")
    render()


async def render_applications():
    """Show only user-entered local records."""
    heading("Saved applications", 2)
    ui.label("Records on this computer only; they reset when the server restarts. Check the UNH store for actual order status.")
    ui.link("Open UNH permit store", STORE, new_tab=True)
    try:
        applications = await request("GET", "/applications")
    except ApiError as error:
        ui.label(str(error)).props('role="alert"')
        action_link("Try again", "/my-parking")
        return
    if not applications:
        ui.label("You have no applications yet.")
        action_link("Find my permit", "/permits")
    for application in reversed(applications):
        with ui.card().classes("task-card w-full"):
            heading(application["permit_type_name"], 2)
            ui.label(f'Confirmation: {application["id"]} · {application["status"].replace("_", " ").title()}')
            ui.label(f'Vehicle: {application["vehicle"]["plate"]} · {application["vehicle"]["state"]}')
            ui.label(application["status_explanation"]).classes("status-note")
            ui.label(application["next_action"])
