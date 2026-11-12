# Run HCI Parking

From the repository folder, set up Python 3.13 and install dependencies.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python parking_api.py
```

Open http://127.0.0.1:8003/ds3/. The HTML, CSS, and JavaScript pages for permits, application status, covered lots, tickets, and help use the same local FastAPI server. Restarting the server clears saved applications and tickets.
