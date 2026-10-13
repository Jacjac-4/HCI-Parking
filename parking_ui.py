"""
parking_ui.py

A very simple NiceGUI frontend that pulls data from parking_api.py
and renders a campus parking permit portal: browse lots, read
announcements, and buy/cancel permits.

Run with:
    python -m pip install -r requirements.txt
    python parking_api.py     # in one terminal
    python parking_ui.py      # in another terminal

Then http://localhost:8082 will open automatically
"""

import requests
from nicegui import ui

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
    render_portal()


@ui.refreshable
def render_portal():
    ui.label("Campus Parking Portal").classes("text-2xl")

    with ui.row().classes("w-full no-wrap"):
        with ui.column().classes("w-1/2 p-2"):
            render_lots()
            render_announcements()
        with ui.column().classes("w-1/2 p-2"):
            render_permit_types()
            render_my_permits()


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


ui.run(port=8082, title="Mock Parking Portal")
