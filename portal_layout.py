"""Shared page layout for the parking portal."""
from contextlib import contextmanager
from pathlib import Path

from nicegui import ui

# UNH's updated navy and white: https://www.iol.unh.edu/about/new_logo_faqs
UNH_NAVY = "#041E42"
NAVIGATION = (
    ("Home", "/"),
    ("Permits", "/permits"),
    ("My Parking", "/my-parking"),
    ("Tickets", "/tickets"),
    ("Parking Help", "/help"),
)


def heading(text: str, level: int = 1):
    return ui.label(text).props(f'role="heading" aria-level="{level}"').classes(f"heading-{level}")


def action_link(text: str, target: str, *, primary: bool = False):
    return ui.link(text, target).classes("action-link" + (" action-primary" if primary else ""))


@contextmanager
def page_layout(current_path: str):
    ui.colors(primary=UNH_NAVY)
    ui.add_css((Path(__file__).with_name("parking.css")).read_text())
    ui.link("Skip to main content", "#main-content").classes("skip-link")
    with ui.header(fixed=False).classes("portal-header"):
        with ui.row().classes("site-width brand-row"):
            with ui.column().classes("brand-name"):
                ui.label("UNIVERSITY OF NEW HAMPSHIRE").classes("university-name")
                ui.link("UNH Parking", "/").classes("site-title")
            with ui.dialog() as account_dialog, ui.card().classes("account-dialog"):
                heading("My account", 2)
                ui.label("Your parking applications")
                ui.label("Enter your details when applying. View your submitted information and manage applications in My Parking.")
                action_link("Open My Parking", "/my-parking")
                ui.button("Close", on_click=account_dialog.close).props("no-caps unelevated")
            ui.button("My account", icon="person_outline", on_click=account_dialog.open).props(
                "outline color=white no-caps"
            )
        with ui.element("nav").props('aria-label="Main navigation"').classes("portal-nav"):
            with ui.row().classes("site-width nav-links"):
                for label, path in NAVIGATION:
                    link = ui.link(label, path).classes("nav-link")
                    if path == current_path:
                        link.props('aria-current="page"')
    with ui.column().classes("site-width portal-content").props('id="main-content" tabindex="-1"'):
        ui.label("COURSE PROTOTYPE · NO REAL PERMITS OR PAYMENTS").classes("demo-notice")
        yield
    with ui.element("footer").classes("site-width portal-footer"):
        with ui.column().classes("footer-links"):
            ui.link("Parking services and help", "/help")
            ui.link("Permit rules and lot information", "/lots")
        with ui.link(target="/help").classes("help-launcher"):
            ui.icon("chat_bubble_outline").props('aria-hidden="true"')
            ui.label("Parking help")
