# Run HCI Parking

## Setup

Use Python 3.13. From this repository's folder:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Start the application

Run the API in one terminal:

```sh
.venv/bin/python parking_api.py
```

Run the interface in a second terminal, from the same folder:

```sh
.venv/bin/python parking_ui.py
```

Keep both terminals running, then open http://localhost:8082 in your browser.
The API runs at http://localhost:8003. Stop each server with Ctrl+C.
Restarting the API clears the applications and tickets entered during the session.
