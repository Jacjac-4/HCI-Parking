import unittest
from uuid import uuid4
from fastapi.testclient import TestClient
import parking_api as api

class SavedVehicleTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)
        api.SAVED_VEHICLES.clear()
        api.APPLICATIONS.clear()
        api.APPLICATION_REQUESTS.clear()
        self.vehicle = {'plate': ' save123 ', 'state': 'nh', 'vehicle_type': 'car'}

    def tearDown(self):
        api.SAVED_VEHICLES.clear()
        api.APPLICATIONS.clear()
        api.APPLICATION_REQUESTS.clear()
        self.client.close()

    def test_crud_deduplication_and_application_snapshot(self):
        saved = self.client.post('/vehicles', json=self.vehicle).json()
        self.assertEqual(saved['plate'], 'SAVE123')
        self.assertEqual(self.client.post('/vehicles', json=self.vehicle).json(), saved)
        self.assertEqual(self.client.get('/vehicles').json(), [saved])
        application = self.client.post('/applications', json={
            'permit_type_id': 1, 'request_id': str(uuid4()),
            'applicant': {'name': 'Test Student', 'residence': 'off_campus', 'year': 'continuing', 'commuter_eligible': True},
            'vehicle': {key: saved[key] for key in self.vehicle},
        }).json()
        self.vehicle['plate'] = 'CHANGED'
        response = self.client.put('/vehicles/' + saved['id'], json=self.vehicle)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['plate'], 'CHANGED')
        self.assertEqual(self.client.delete('/vehicles/' + saved['id']).status_code, 200)
        self.assertEqual(self.client.get('/vehicles').json(), [])
        self.assertEqual(self.client.get('/applications/' + application['id']).json()['vehicle']['plate'], 'SAVE123')
        self.assertEqual(self.client.delete('/vehicles/' + saved['id']).status_code, 404)

    def test_edit_cannot_duplicate_another_saved_vehicle(self):
        first = self.client.post('/vehicles', json=self.vehicle).json()
        second = self.client.post('/vehicles', json={**self.vehicle, 'plate': 'SECOND'}).json()
        self.assertEqual(self.client.put('/vehicles/' + second['id'], json=self.vehicle).status_code, 409)
        self.assertEqual(self.client.put('/vehicles/' + first['id'], json=self.vehicle).status_code, 200)
        self.assertEqual([item['plate'] for item in self.client.get('/vehicles').json()], ['SAVE123', 'SECOND'])

    def test_validation_and_vehicle_compatibility(self):
        for change in ({'plate': '<script>'}, {'state': 'New Hampshire'}, {'vehicle_type': 'truck'}):
            self.assertEqual(self.client.post('/vehicles', json={**self.vehicle, **change}).status_code, 422)
        self.assertEqual(self.client.put('/vehicles/missing', json=self.vehicle).status_code, 404)
        self.assertEqual(self.client.get('/vehicles').json(), [])
        response = self.client.post('/applications', json={
            'permit_type_id': 1, 'request_id': str(uuid4()),
            'applicant': {'name': 'Test Student', 'residence': 'off_campus', 'year': 'continuing', 'commuter_eligible': True},
            'vehicle': {**self.vehicle, 'vehicle_type': 'moped'},
        })
        self.assertEqual(response.status_code, 422)

    def test_unicode_headers_logo_and_vehicle_page(self):
        for path in ('/ds3/vehicles', '/ds3/portal.js', '/ds3/draft.mjs', '/ds3/styles.css'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn('charset=utf-8', response.headers['content-type'])
            self.assertNotIn('\ufffd', response.text)
        self.assertEqual(self.client.get('/ds3-assets/branding/unh-logo.svg').status_code, 200)
