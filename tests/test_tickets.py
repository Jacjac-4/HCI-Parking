"""Ticket entry contracts; test records never seed the running prototype."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from fastapi.testclient import TestClient

from parking_api import app
import ticket_api


class TicketTests(unittest.TestCase):
    def setUp(self):
        ticket_api.TICKETS.clear()
        ticket_api.REQUESTS.clear()
        ticket_api.ACTIONS.clear()
        self.client = TestClient(app)
        self.body = dict(number=" ab-123 ", amount="12.34", reason=" Entered reason ", request_id=str(uuid4()))

    def tearDown(self):
        ticket_api.TICKETS.clear()
        ticket_api.REQUESTS.clear()
        ticket_api.ACTIONS.clear()
        self.client.close()

    def test_empty_start_and_normalized_exact_search(self):
        self.assertEqual(self.client.get('/tickets').json(), [])
        response = self.client.post('/tickets', json=self.body)
        self.assertEqual(response.status_code, 200)
        ticket = response.json()
        self.assertEqual(ticket['number'], 'AB-123')
        self.assertEqual(ticket['amount_cents'], 1234)
        self.assertEqual(ticket['reason'], 'Entered reason')
        self.assertEqual(ticket['source'], 'user_entered')
        self.assertEqual(ticket['status'], 'unpaid')
        self.assertEqual(self.client.get('/tickets', params={'number': ' ab-123 '}).json(), [ticket])
        self.assertEqual(self.client.get('/tickets', params={'number': 'AB'}).json(), [])

    def test_retry_and_duplicate_protection(self):
        first = self.client.post('/tickets', json=self.body).json()
        self.assertEqual(self.client.post('/tickets', json=self.body).json(), first)
        self.body['amount'] = '15.00'
        self.assertEqual(self.client.post('/tickets', json=self.body).status_code, 409)
        self.body['request_id'] = str(uuid4())
        self.assertEqual(self.client.post('/tickets', json=self.body).status_code, 409)
        self.assertEqual(len(ticket_api.TICKETS), 1)

    def test_concurrent_retries_create_one_record(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.client.post('/tickets', json=self.body), range(4)))
        self.assertTrue(all(r.status_code == 200 for r in results))
        self.assertEqual(len(ticket_api.TICKETS), 1)

    def test_invalid_amounts_and_fields_do_not_create_records(self):
        for field, value in [('amount', '0'), ('amount', '-1'), ('amount', '1.001'), ('amount', '10000'),
                             ('amount', 'NaN'), ('amount', 'Infinity'), ('amount', True),
                             ('number', ' '), ('number', '<script>'), ('number', 'X' * 41),
                             ('reason', ' '), ('reason', 'X' * 501), ('request_id', 'bad')]:
            with self.subTest(field=field, value=value):
                self.assertEqual(self.client.post('/tickets', json={**self.body, field: value}).status_code, 422)
        self.assertEqual(ticket_api.TICKETS, [])

    def test_money_is_stored_as_exact_cents(self):
        for index, (amount, cents) in enumerate([('0.01', 1), ('0.10', 10), ('19.99', 1999), ('9999.99', 999999)]):
            body = {**self.body, 'number': str(index), 'amount': amount, 'request_id': str(uuid4())}
            self.assertEqual(self.client.post('/tickets', json=body).json()['amount_cents'], cents)


if __name__ == '__main__':
    unittest.main()
