"""Application contract checks; no live server or real parking records required."""
import copy
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient

import parking_api as api


class ApplicationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)
        self.permits = copy.deepcopy(api.MY_PERMITS)
        self.capacity = api.PERMIT_TYPES[0]["capacity"]
        api.APPLICATIONS.clear()
        api.APPLICATION_REQUESTS.clear()
        self.body = {
            "permit_type_id": 1,
            "vehicle": {"plate": " demo123 ", "state": "nh", "vehicle_type": "car"},
            "request_id": str(uuid4()),
        }

    def tearDown(self):
        api.APPLICATIONS.clear()
        api.APPLICATION_REQUESTS.clear()
        api.MY_PERMITS[:] = self.permits
        api.PERMIT_TYPES[0]["capacity"] = self.capacity
        self.client.close()

    def submit(self, body=None):
        return self.client.post("/applications", json=body or self.body)

    def test_submission_is_pending_and_does_not_purchase_permit(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200)
        record = response.json()
        self.assertEqual(record["status"], "under_review")
        self.assertEqual(record["authorization"], "not_valid")
        self.assertIsNone(record["permit_id"])
        self.assertEqual(record["vehicle"]["plate"], "DEMO123")
        self.assertEqual(record["vehicle"]["state"], "NH")
        self.assertEqual(api.MY_PERMITS, self.permits)
        self.assertEqual(self.client.get('/applications/' + record["id"]).json(), record)
        self.assertEqual(self.client.get('/applications').json(), [record])
        self.assertEqual(self.client.get('/applications/' + record["id"]).json()["status"], "under_review")

    def test_retry_returns_same_confirmation_and_changed_retry_is_rejected(self):
        first = self.submit().json()
        self.assertEqual(self.submit().json(), first)
        self.body["vehicle"]["plate"] = "CHANGED"
        self.assertEqual(self.submit().status_code, 409)
        self.assertEqual(len(api.APPLICATIONS), 1)

    def test_concurrent_retries_create_one_application(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.submit(), range(4)))
        self.assertTrue(all(r.status_code == 200 for r in responses))
        self.assertEqual(len({r.json()["id"] for r in responses}), 1)
        self.assertEqual(len(api.APPLICATIONS), 1)

    def test_new_request_id_cannot_duplicate_pending_application(self):
        self.assertEqual(self.submit().status_code, 200)
        self.body["request_id"] = str(uuid4())
        self.assertEqual(self.submit().status_code, 409)
        self.assertEqual(len(api.APPLICATIONS), 1)

    def test_invalid_inputs_do_not_create_records(self):
        for field, value in (("plate", " "), ("plate", "<script>"), ("state", "N"), ("vehicle_type", "truck")):
            with self.subTest(field=field, value=value):
                body = copy.deepcopy(self.body)
                body["vehicle"][field] = value
                self.assertEqual(self.submit(body).status_code, 422)
        for field, value in (("permit_type_id", True), ("permit_type_id", 0), ("request_id", "invalid")):
            with self.subTest(field=field):
                body = copy.deepcopy(self.body)
                body[field] = value
                self.assertEqual(self.submit(body).status_code, 422)
        self.assertEqual(api.APPLICATIONS, [])

    def test_eligibility_vehicle_and_capacity_are_enforced(self):
        self.body["permit_type_id"] = 3
        self.assertEqual(self.submit().status_code, 403)
        self.body["permit_type_id"] = 5
        self.assertEqual(self.submit().status_code, 422)
        self.body["vehicle"]["vehicle_type"] = "motorcycle"
        self.assertEqual(self.submit().status_code, 200)
        self.body["request_id"] = str(uuid4())
        self.body["permit_type_id"] = 1
        self.body["vehicle"]["vehicle_type"] = "car"
        api.PERMIT_TYPES[0]["capacity"] = 0
        self.assertEqual(self.submit().status_code, 409)
        self.assertEqual(len(api.APPLICATIONS), 1)

    def test_unknown_records_and_read_only_profile(self):
        self.body["permit_type_id"] = 999
        self.assertEqual(self.submit().status_code, 404)
        self.assertEqual(self.client.get('/applications/APP-9999').status_code, 404)
        self.assertEqual(self.client.get('/profile').json()["category"], "commuter")
        self.assertEqual(self.client.post('/profile', json={}).status_code, 405)
        options = self.client.get('/permit-types').json()
        self.assertFalse(next(p for p in options if p["id"] == 3)["eligible"])
        self.assertIn("price", options[0])
        self.assertIn("available", options[0])


if __name__ == '__main__':
    unittest.main()
