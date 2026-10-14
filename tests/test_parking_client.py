"""Distinguish empty data, rejected requests, and uncertain submissions."""
import unittest
from unittest.mock import AsyncMock, patch

import requests

from parking_client import ApiError, request


def response(status, content):
    result = requests.Response()
    result.status_code = status
    result._content = content.encode()
    return result


class ParkingClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_preserves_confirmation_data(self):
        with patch('parking_client.run.io_bound', new=AsyncMock(return_value=response(200, '{"id":"APP-0001"}'))):
            self.assertEqual(await request('POST', '/applications', {}), {'id': 'APP-0001'})

    async def test_empty_collection_is_a_success(self):
        with patch('parking_client.run.io_bound', new=AsyncMock(return_value=response(200, '[]'))):
            self.assertEqual(await request('GET', '/applications'), [])

    async def test_unreachable_service_is_not_an_empty_collection(self):
        with patch('parking_client.run.io_bound', new=AsyncMock(side_effect=requests.ConnectionError)):
            with self.assertRaises(ApiError) as caught:
                await request('GET', '/applications')
            self.assertFalse(caught.exception.uncertain)

    async def test_failed_post_may_already_have_been_received(self):
        with patch('parking_client.run.io_bound', new=AsyncMock(side_effect=requests.Timeout)):
            with self.assertRaises(ApiError) as caught:
                await request('POST', '/applications', {})
            self.assertTrue(caught.exception.uncertain)

    async def test_rejection_retains_message_and_allows_editing(self):
        with patch('parking_client.run.io_bound', new=AsyncMock(return_value=response(403, '{"detail":"Not eligible"}'))):
            with self.assertRaises(ApiError) as caught:
                await request('POST', '/applications', {})
            self.assertEqual(str(caught.exception), 'Not eligible')
            self.assertFalse(caught.exception.uncertain)

    async def test_server_error_or_unreadable_success_keeps_post_uncertain(self):
        for result in (response(500, 'Unavailable'), response(200, 'Not JSON')):
            with self.subTest(status=result.status_code):
                with patch('parking_client.run.io_bound', new=AsyncMock(return_value=result)):
                    with self.assertRaises(ApiError) as caught:
                        await request('POST', '/applications', {})
                    self.assertTrue(caught.exception.uncertain)


if __name__ == '__main__':
    unittest.main()
