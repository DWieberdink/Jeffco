import csv
import json
import sys

# Thresholds as in Decisionlogic.js
default_thresholds = {
    'utilization': 0.65,
    'utilizationHigh': 0.95,
    'enrollmentGrowth': 0,
    'projectedUtilization': 0.95,
    'distanceUnderutilized': 1.0,
    'buildingThreshold': 1.5,
    'adequateProgramsMin': 2
}

def evaluate_school(row, t=default_thresholds):
    def to_float(val):
        try:
            return float(val)
        except:
            return 0.0
    decisions = {
        'F': to_float(row['Utilization']) > t['utilization'],
        'G': to_float(row['Utilization']) > t['utilizationHigh'],
        'K': to_float(row['ExpectedUtilization10yrs']) > t['projectedUtilization'],
        'I': to_float(row['2014-2024_EnrollmentGrowth']) > t['enrollmentGrowth'],
        'M': to_float(row['DistanceUnderutilizedschools']) <= t['distanceUnderutilized'],
        'U': to_float(row['BuildingTreshhold']) <= t['buildingThreshold'],
        'X': to_float(row['AdequateProgramOffer']) >= t['adequateProgramsMin'],
        'W': to_float(row['AdequateProgramOffer']) >= t['adequateProgramsMin'],
        'Z': str(row['SiteCapacity']).lower().strip() == 'yes'
    }
    decisions['O'] = decisions['M']
    if not decisions['F']:
        if not decisions['I']:
            if decisions['M']:
                return 'Candidate for Closure/Merger'
            if decisions['U']:
                return 'Ongoing Monitoring & Evaluation' if decisions['X'] else 'Programmatic Investment'
            return 'Building Investment' if decisions['W'] else 'Building & Programmatic Investments'
        if decisions['U']:
            return 'Ongoing Monitoring & Evaluation' if decisions['X'] else 'Programmatic Investment'
        return 'Building Investment' if decisions['W'] else 'Building & Programmatic Investments'
    if not decisions['G']:
        if decisions['U']:
            return 'Ongoing Monitoring & Evaluation' if decisions['X'] else 'Programmatic Investment'
        return 'Building Investment' if decisions['W'] else 'Building & Programmatic Investments'
    if not decisions['K']:
        if decisions['U']:
            return 'Ongoing Monitoring & Evaluation' if decisions['X'] else 'Programmatic Investment'
        return 'Building Investment' if decisions['W'] else 'Building & Programmatic Investments'
    if decisions['O']:
        return 'School-specific evaluation of alternative options'
    if decisions['Z']:
        return 'Candidate for Building Addition'
    return 'School-specific evaluation of alternative options'

def normalize_name(name):
    return name.lower().replace('\u00a0', ' ').replace('  ', ' ').strip()

def main():
    # File paths
    csv_path = 'Decision Data Export.csv'
    geojson_path = 'Schools.geojson'
    output_path = 'Schools_decision.geojson'

    # Read CSV
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        csv_data = {normalize_name(row['Building Name']): row for row in reader}

    # Read GeoJSON
    with open(geojson_path, encoding='utf-8') as f:
        geojson = json.load(f)

    # Inject decision type
    for feature in geojson['features']:
        name = normalize_name(feature['properties']['Building Name'])
        row = csv_data.get(name)
        if row:
            decision = evaluate_school(row)
        else:
            decision = 'Unknown'
        feature['properties']['Decision Type'] = decision

    # Write new GeoJSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, indent=2)
    print(f'Wrote {output_path}')

if __name__ == '__main__':
    main() 