"""Serve the DS3 pages alongside the existing prototype API."""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from unh_catalog import COMMUTER_RULE, RESIDENCES

router = APIRouter(prefix="/ds3")
directory = Path(__file__).resolve().parent
pages = (
    ("", "Home", "My Parking"),
    ("/permits", "Permits", "Find my permit"),
    ("/my-parking", "My Parking", "My Parking"),
    ("/lots", "Covered lots", "Covered lots"),
    ("/tickets", "Tickets", "Parking tickets"),
    ("/help", "Parking Help", "Parking Help"),
)


@router.get("/styles.css", include_in_schema=False)
def styles():
    return Response((directory / "styles.css").read_text(), media_type="text/css")


@router.get("/portal.js", include_in_schema=False)
def script():
    return Response((directory / "portal.js").read_text(), media_type="text/javascript")


@router.get("/permit-form-options")
def permit_form_options():
    return {"residences": RESIDENCES, "commuter_rule": COMMUTER_RULE}


@router.get("/", response_class=HTMLResponse)
@router.get("/{page}", response_class=HTMLResponse)
def page(page: str = ""):
    path = f"/{page}" if page else ""
    title = next((title for route, _, title in pages if route == path), None)
    if title is None:
        raise HTTPException(status_code=404)
    nav = []
    for route, label, _ in pages:
        current = ' aria-current="page"' if route == path else ""
        nav.append(f'<a href="/ds3{route or "/"}"{current}>{label}</a>')
    return (directory / "page.html").read_text().format(
        title=title, browser_title="Home" if not page else title, navigation="".join(nav), page=page or "home",
        brand='<a href="/ds3/">UNH Parking</a>' if page else '<strong class="brand-title">UNH Parking</strong>',
        footer_help='' if page == "help" else '<a class="button-link primary" href="/ds3/help">Parking Help</a>',
        intro='<p class="page-intro">Find a permit, check your status, or manage a ticket.</p>' if not page else "",
    )
