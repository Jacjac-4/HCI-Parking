import re
import unittest

from fastapi.testclient import TestClient

from parking_api import app


class SprintThreeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_navigation_matches_each_page_and_keeps_every_task_on_one_server(self):
        titles = set()
        for route in ("/", "/permits", "/my-parking", "/lots", "/tickets", "/help"):
            with self.subTest(route=route):
                response = self.client.get("/ds3" + route)
                self.assertEqual(response.status_code, 200)
                html = response.text
                self.assertEqual(re.findall(r'href="([^"]+)" aria-current="page"', html), ["/ds3" + route])
                self.assertNotIn("8082", html)
                self.assertNotIn("course prototype", html.lower())
                titles.add(re.search(r"<title>(.*?)</title>", html).group(1))
        self.assertEqual(len(titles), 6)

    def test_freshman_matches_depend_on_residence_and_commuter_answers(self):
        applicant = {"name": "Demo", "year": "freshman", "residence": "gables", "commuter_eligible": True}
        self.assertEqual(self.client.post("/permit-matches", json=applicant).json(), [])
        applicant.update(residence="off_campus", commuter_eligible=False)
        self.assertEqual({permit["id"] for permit in self.client.post("/permit-matches", json=applicant).json()}, {7, 8, 9})
        applicant["commuter_eligible"] = True
        self.assertEqual({permit["id"] for permit in self.client.post("/permit-matches", json=applicant).json()}, {1, 7, 8, 9})
