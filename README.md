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
