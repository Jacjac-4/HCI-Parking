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

## Demo application API

`GET /profile` returns a fictional commuter and saved vehicle. Permit options now
include `eligible`, `eligibility_reason`, and `vehicle_requirement`; these sample
rules and the starter prices are not official UNH policy.

`POST /applications` accepts `permit_type_id`, a `vehicle` containing `plate`,
two-letter `state`, and `vehicle_type` (`car` or `motorcycle`), plus a UUID
`request_id`. Generate a new UUID for a new submission; reuse it with the same
details when retrying an uncertain submission. A retry returns the original
confirmation. Reusing the ID with different details returns 409.

Applications start `under_review` with `authorization: not_valid`. They do not
purchase a permit, reserve inventory, or become approved when refreshed.
`GET /applications` and `GET /applications/{id}` retrieve the saved records.
The single-user data is in memory and resets when the API restarts. Run one API
process for the demo. The UI will connect to these routes in the next chunk.

Run the API contract checks from the repository folder:

```sh
.venv/bin/python -m unittest discover -s tests -v
```
