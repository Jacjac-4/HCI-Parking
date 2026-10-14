"""Published Durham student permit information, checked October 14, 2026.

Source: https://www.unh.edu/transportation/parking/permits/student
Prices: https://www.unh.edu/transportation/parking/parking-permits/permit-prices
This catalog does not represent live inventory or an eligibility decision.
"""
SOURCE = 'https://www.unh.edu/transportation/parking/permits/student'
STORE = 'https://unh.thepermitstore.com/purchase.php'
RESIDENCES = {
    'off_campus': 'Off campus',
    'gables': 'Gables',
    'woodside': 'Woodside',
    'north': 'North of Main Street: Congreve, McLaughlin, Adams Tower, Lord, Jessie Doe, Stoke, Sawyer, Scott',
    'south': 'South of Main Street: Hetzel, Fairchild, Alexander, Mills, Babcock, Devine, Randall, Hitchcock, Engelhardt, Hunter, Gibbs, Hubbard, Christensen, Williamson, Hall, Eaton, Richardson, Marston, Haaland, Peterson, Handler',
}
COMMUTER_RULE = ('Live more than 1 mile from campus and more than ¼ mile from a Campus Connector or in-town Durham Wildcat Transit stop. '
                 'Cottages, Lodges, Rivers Edge, Madbury Commons, Campus Flats, campus housing, and residences within the exclusion zone are ineligible.')
WEST = ['West Edge Lot', 'Mast Road Lot', 'Mathes Lot']

def permit(id, name, price, lots, rule, vehicle='car'):
    return dict(id=id, name=name, price=price, lots=lots, eligibility_reason=rule,
                vehicle_requirement=vehicle, term='Academic year (fall and spring)',
                source_url=SOURCE, checked_on='2026-10-14')

PERMIT_TYPES = [
    permit(1, 'Commuter', 150, ['Lot A', 'Lot M', 'Lot G1', 'Moiles Lot', *WEST], COMMUTER_RULE),
    permit(2, 'Gables', 650, ['Gables Lots'], 'Non-freshman residents of Gables only.'),
    permit(3, 'Woodside', 650, ['Woodside Lots'], 'Non-freshman residents of Woodside only.'),
    permit(4, 'Strafford', 650, ['Strafford Lot'], 'Non-freshman residents of the listed halls north of Main Street; excludes Gables and Woodside. Not valid in Strafford Avenue spaces.'),
    permit(5, 'Resident East', 650, ['Lot E', 'Lot E1', 'Lot E2', 'Evergreen Lot', 'Lot F'], 'Non-freshman residents of the listed halls south of Main Street.'),
    permit(6, 'Resident West', 500, WEST, 'Non-freshman residents of any UNH Housing residence hall or complex.'),
    permit(7, 'Non-Resident (storage)', 900, WEST, 'Students living off campus. Limited permits; lottery or waitlist may apply.'),
    permit(8, 'Motorcycle', 95, ['Signed Motorcycle Parking spaces'], 'Off-campus students of any year or non-freshman campus residents. Campus residents may bring a car OR motorcycle/moped, not both.', 'motorcycle'),
    permit(9, 'Moped', 95, ['Signed Moped Parking areas'], 'Off-campus students of any year or non-freshman campus residents. Campus residents may bring a car OR motorcycle/moped, not both.', 'moped'),
]
LOTS = [dict(id=i, name=name) for i, name in enumerate(sorted({lot for p in PERMIT_TYPES for lot in p['lots']}), 1)]

def eligible(permit_id, applicant):
    """Guide based on self-reported answers; UNH makes the actual decision."""
    off = applicant['residence'] == 'off_campus'
    resident = not off and applicant['year'] != 'freshman'
    return {
        1: off and applicant['commuter_eligible'],
        2: resident and applicant['residence'] == 'gables',
        3: resident and applicant['residence'] == 'woodside',
        4: resident and applicant['residence'] == 'north',
        5: resident and applicant['residence'] == 'south',
        6: resident, 7: off, 8: off or resident, 9: off or resident,
    }.get(permit_id, False)
