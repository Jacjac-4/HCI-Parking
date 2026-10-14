"""Local copies of UNH's published maps, paired with the permit coverage list."""
from nicegui import ui

MAP_FILES = {
    1: "commuter.jpg",
    2: "resident-core.jpg", 3: "resident-core.jpg", 4: "resident-core.jpg", 5: "resident-core.jpg",
    6: "resident-west.jpg", 7: "resident-west.jpg",
    8: "motorcycle-moped.jpg", 9: "motorcycle-moped.jpg",
}


def render_map(permit, *, preview=False):
    path = '/assets/maps/' + MAP_FILES[permit['id']]
    ui.image(path).props(f'fit=contain alt="UNH campus parking map for {permit["name"]}; covered locations are listed alongside the map"').classes('w-full')
    if not preview:
        if permit['id'] == 7:
            ui.label("The Resident West map shows the same three lots covered by Non-Resident storage permits.")
        elif permit['id'] in (2, 3, 4, 5):
            ui.label("This map shows all four Resident Core categories. Use only the lots listed for your selected permit.")
        ui.link("Open full-size map", path, new_tab=True)
        ui.label("Map: UNH Transportation, 2026–27 reference. Stored within this prototype; no live availability is shown.").classes("support-copy")
