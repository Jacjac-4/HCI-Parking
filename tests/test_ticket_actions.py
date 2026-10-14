"""Prototype payments/appeals must be atomic, reviewable, and retry safe."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient

from parking_api import app
import ticket_api


class ActionTests(unittest.TestCase):
    def setUp(self):
        ticket_api.TICKETS.clear()
        ticket_api.REQUESTS.clear()
        ticket_api.ACTIONS.clear()
        self.client = TestClient(app)
        self.tickets = [self.client.post('/tickets', json=dict(number=str(i), amount=amount,
                        reason='Test reason', request_id=str(uuid4()))).json()
                        for i, amount in enumerate(['12.34', '0.10'])]
        self.body = dict(ticket_ids=[t['id'] for t in self.tickets], action='pay',
                         expected_total_cents=1244, request_id=str(uuid4()))

    def tearDown(self):
        ticket_api.TICKETS.clear()
        ticket_api.REQUESTS.clear()
        ticket_api.ACTIONS.clear()
        self.client.close()

    def post(self, **changes):
        return self.client.post('/ticket-actions', json={**self.body, **changes})

    def test_payment_receipt_and_retry(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        receipt = response.json()
        self.assertTrue(receipt['prototype'])
        self.assertEqual(receipt['total_cents'], 1244)
        self.assertEqual(len(receipt['tickets']), 2)
        self.assertEqual(self.post().json(), receipt)
        saved = self.client.get('/tickets').json()
        self.assertTrue(all(t['status'] == 'paid' and t['confirmation'] == receipt for t in saved))
        self.assertEqual(self.post(action='appeal', explanation='Changed action').status_code, 409)
        self.assertEqual(self.post(request_id=str(uuid4())).status_code, 409)

    def test_appeal_requires_explanation_and_prevents_payment(self):
        self.assertEqual(self.post(action='appeal', explanation=' ').status_code, 422)
        receipt = self.post(action='appeal', explanation='  Please review this ticket.  ').json()
        self.assertEqual(receipt['explanation'], 'Please review this ticket.')
        self.assertTrue(all(t['status'] == 'appeal_pending' for t in self.client.get('/tickets').json()))
        self.assertEqual(self.post(request_id=str(uuid4())).status_code, 409)

    def test_invalid_selection_and_stale_total_leave_all_tickets_unchanged(self):
        for changes, status in [({'ticket_ids': []}, 422),
                                ({'ticket_ids': [self.tickets[0]['id']] * 2}, 422),
                                ({'ticket_ids': [self.tickets[0]['id'], 'missing']}, 404),
                                ({'expected_total_cents': 1245}, 409),
                                ({'expected_total_cents': True}, 422)]:
            with self.subTest(changes=changes):
                self.assertEqual(self.post(**changes).status_code, status)
                self.assertTrue(all(t['status'] == 'unpaid' for t in self.client.get('/tickets').json()))
        self.assertEqual(ticket_api.ACTIONS, {})

    def test_concurrent_retries_have_one_receipt(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.post(), range(4)))
        self.assertTrue(all(r.status_code == 200 for r in responses))
        self.assertEqual(len({r.json()['id'] for r in responses}), 1)
        self.assertEqual(len(ticket_api.ACTIONS), 1)

    def test_overlapping_actions_never_partially_resolve_a_batch(self):
        first = self.tickets[0]
        self.assertEqual(self.post(ticket_ids=[first['id']], expected_total_cents=1234).status_code, 200)
        self.assertEqual(self.post(action='appeal', explanation='Review both', request_id=str(uuid4())).status_code, 409)
        self.assertEqual([t['status'] for t in self.client.get('/tickets').json()], ['paid', 'unpaid'])


if __name__ == '__main__':
    unittest.main()
