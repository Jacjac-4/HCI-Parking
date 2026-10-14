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

## Independent prototype

The five-step permit journey runs entirely inside this application: About you,
Permit, Vehicle, Review, and Confirmation. Users enter their own information;
there are no seeded people, vehicles, applications, or tickets. Submissions appear
as **Under review** in My Parking, with an explicit explanation that an application
does not authorize parking. This course prototype does not issue real permits.

Users can inspect their submitted details, open the lots covered by their selected
permit, or confirm withdrawal and submit a corrected application. Withdrawal is
safe to retry. Parking help provides in-app guidance for these tasks. No user
workflow redirects to the existing UNH portal or permit store.

`unh_catalog.py` contains published Durham academic-year student categories,
prices, eligibility guidance, and lot coverage checked October 14, 2026. Reference
sources (documentation only, not application destinations):

- https://www.unh.edu/transportation/parking/permits/student
- https://www.unh.edu/transportation/parking/parking-permits/permit-prices
- https://www.unh.edu/transportation/parking/campus-parking-maps

Suggestions use self-reported answers. There is no invented inventory or automated
approval. Listed permit prices are reference prices; this prototype collects no
payment or processing fee. Summer, employee, and visitor flows are out of scope.

## API and prototype limits

`GET /permit-types` and `GET /lots` return reference information.
`POST /applications` accepts `permit_type_id`, `applicant` (name, residence,
year, commuter_eligible), `vehicle` (plate, two-letter state, car/motorcycle/moped),
and a UUID `request_id`. Same-ID retries return the same application; changed
payloads with that ID return 409. The UI preserves the payload after an uncertain
response and pauses editing until Retry resolves the outcome.

`GET /applications` and `GET /applications/{id}` retrieve user-entered records.
`POST /applications/{id}/withdraw` changes a pending application to withdrawn.
Both states retain `authorization: not_valid`; refresh never approves a permit.

This is a single-user local prototype. Servers bind to loopback. Records are
in memory and reset on API restart; no authentication or durable storage is
implemented. Run one API process. Ticket interactions and a geographic map are
not implemented in this chunk. Parking help is a guided FAQ, not an AI chatbot.

## Checks

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Browser checks should cover entering details, reviewing and submitting, visiting
My Parking, opening covered lots, cancelling a withdrawal, confirming withdrawal,
and navigating help. Clear any temporary test records by restarting the API.
