# Run HCI Parking

From the repository folder, set up Python 3.13 and install dependencies.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python parking_api.py
```

Open http://127.0.0.1:8003/ds3/. The HTML, CSS, and JavaScript pages for permits, application status, covered lots, tickets, saved vehicles, and help use the same local FastAPI server. Restarting the server clears saved applications, tickets, and vehicles. Saved vehicles are shared within this single-user server session. Applications retain a copy of their vehicle details even after a saved vehicle is edited or removed. Permit drafts are recovered in the same browser tab using session storage.

Run the checks with `.venv/bin/python -m unittest discover -s tests` after installing `requirements-dev.txt`.

Optional frontend draft-recovery checks (Node.js): `node tests/test_frontend.mjs`.
