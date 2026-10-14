# HCI Parking — Design Sprint 2

## Local setup

From this repository's folder, using Python 3.13:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

The `.venv` directory is local and excluded from Git. Dependencies are pinned to
the versions verified during setup.

## Run

In one terminal, from this folder:

```sh
.venv/bin/python parking_api.py
```

In another terminal, from this folder:

```sh
.venv/bin/python parking_ui.py
```

The API runs at http://localhost:8003 and the UI at http://localhost:8082.

## Editor imports

The repository's VS Code settings default to `.venv/bin/python`. If the editor
already has a different interpreter selected, use **Python: Select Interpreter**
and select this repository's `.venv/bin/python`. When opening the parent CS 760
folder, select `Design Sprint 2/HCI-Parking/.venv/bin/python`.

## Permit planner and official data

The application starts empty. Users enter their name, student year, residence,
and vehicle; no runtime sample accounts, permits, announcements, or tickets are seeded.
The five-step form retains entries when using Back/Edit, validates them, and saves
local confirmations under My Parking. Reloading the form starts a new application.

`unh_catalog.py` contains published Durham academic-year student permit categories,
prices, eligibility guidance, and lot coverage checked October 14, 2026:

- https://www.unh.edu/transportation/parking/permits/student
- https://www.unh.edu/transportation/parking/parking-permits/permit-prices
- https://www.unh.edu/transportation/parking/campus-parking-maps

Suggestions use self-reported answers, not verified UNH eligibility. Published
prices exclude the $3.95 student online processing fee displayed during review.
The official store requires sign-in for account-specific availability, lotteries,
and waitlists: https://unh.thepermitstore.com/purchase.php. No live capacity,
inventory, or approval information is fabricated. Summer, employee, and visitor
permits remain on the official UNH site.

## Local application API

`GET /permit-types` and `GET /lots` return published reference information.
`POST /applications` accepts `permit_type_id`, `applicant` (name, residence,
year, commuter_eligible), `vehicle` (plate, two-letter state, car/motorcycle/moped),
and a UUID `request_id`. Same-ID retries return the same confirmation; changed
payloads with that ID return 409. The UI preserves the payload after an uncertain
response, and pauses editing until Retry resolves the outcome.

Saved records have `status: saved_locally` and `authorization: not_valid`.
They are NOT submitted to UNH, purchased permits, or parking authorization.
The confirmation links to the official store to complete a real order.
`GET /applications` and `GET /applications/{id}` return only user-entered records.

This is a single-user, local course application. Both servers bind to loopback.
Records are held in memory and reset on API restart; no login or multi-user
storage is implemented. Do not expose it as a shared service. Ticket payment,
appeals, and guided help remain future implementation chunks.

Run checks:

```sh
.venv/bin/python -m unittest discover -s tests -v
```
