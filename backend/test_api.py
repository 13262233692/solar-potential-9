import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import json
import pytest
from app import app
from radiation_calculator import RadiationCalculator
from geometry_analyzer import GeometryAnalyzer
from building_data_manager import BuildingDataManager


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestRadiationCalculator:
    def setup_method(self):
        self.calculator = RadiationCalculator()

    def test_calculate_annual_radiation(self):
        result = self.calculator.calculate_annual_radiation(
            latitude=31.2304,
            longitude=121.4737,
            tilt=0,
            azimuth=180,
            roof_area=100
        )

        assert result is not None
        assert 'annual_radiation' in result
        assert result['annual_radiation'] > 0
        assert 'monthly_radiation' in result
        assert len(result['monthly_radiation']) == 12
        assert 'simple_sky_dome' in result
        assert 'pv_potential' not in result

    def test_simple_sky_dome_model(self):
        result = self.calculator._simple_sky_dome_model(
            latitude=31.2304,
            longitude=121.4737,
            tilt=0,
            azimuth=180,
            roof_geometry=None
        )

        assert result is not None
        assert 'daily_data' in result
        assert len(result['daily_data']) == 365
        assert 'annual_average' in result
        assert 'sky_sectors' in result
        assert len(result['sky_sectors']) == 8

    def test_estimate_pv_potential(self):
        result = self.calculator.estimate_pv_potential(1200, 100)

        assert result is not None
        assert 'annual_ac_kwh' in result
        assert result['annual_ac_kwh'] > 0
        assert 'dc_rating_kwp' in result
        assert 'co2_reduction_tonnes' in result
        assert 'economics' in result

    def test_calculate_sky_sectors(self):
        sectors = self.calculator._calculate_sky_sectors(31.2304, 121.4737, 0, 180)

        assert len(sectors) == 8
        total_percentage = sum(s['percentage'] for s in sectors)
        assert abs(total_percentage - 100) < 1.0


class TestGeometryAnalyzer:
    def setup_method(self):
        self.analyzer = GeometryAnalyzer()
        self.test_roof_geometry = {
            'type': 'Polygon',
            'coordinates': [[
                [121.4737, 31.2304],
                [121.4740, 31.2304],
                [121.4740, 31.2307],
                [121.4737, 31.2307],
                [121.4737, 31.2304]
            ]]
        }

    def test_analyze_roof(self):
        result = self.analyzer.analyze_roof(self.test_roof_geometry, tilt=0, azimuth=180)

        assert result is not None
        assert 'area' in result
        assert result['area'] > 0
        assert 'perimeter' in result
        assert 'centroid' in result
        assert 'roof_type' in result
        assert 'orientation' in result

    def test_calculate_geographic_area(self):
        coords = [
            (121.4737, 31.2304),
            (121.4740, 31.2304),
            (121.4740, 31.2307),
            (121.4737, 31.2307)
        ]
        area = self.analyzer._calculate_geographic_area(coords)

        assert area > 0

    def test_generate_heatmap_grid(self):
        result = self.analyzer.generate_heatmap_grid(
            self.test_roof_geometry,
            {'annual_radiation_kwh_m2': 1200},
            grid_size=2
        )

        assert result is not None
        assert 'grid' in result
        assert 'min_value' in result
        assert 'max_value' in result
        assert 'color_scale' in result

    def test_classify_roof_type(self):
        coords = [[121.4737, 31.2304, 10]] * 4

        assert self.analyzer._classify_roof_type(coords, 0) == 'flat'
        assert self.analyzer._classify_roof_type(coords, 10) == 'low_slope'
        assert self.analyzer._classify_roof_type(coords, 20) == 'moderate_slope'
        assert self.analyzer._classify_roof_type(coords, 35) == 'steep_slope'
        assert self.analyzer._classify_roof_type(coords, 50) == 'very_steep'

    def test_get_orientation_name(self):
        assert self.analyzer._get_orientation_name(0) == 'N'
        assert self.analyzer._get_orientation_name(90) == 'E'
        assert self.analyzer._get_orientation_name(180) == 'S'
        assert self.analyzer._get_orientation_name(270) == 'W'


class TestBuildingDataManager:
    def setup_method(self):
        self.manager = BuildingDataManager(data_file='test_buildings.json')

    def teardown_method(self):
        if os.path.exists('test_buildings.json'):
            os.remove('test_buildings.json')

    def test_get_all_buildings(self):
        buildings = self.manager.get_all_buildings()
        assert isinstance(buildings, list)
        assert len(buildings) > 0

    def test_get_building(self):
        buildings = self.manager.get_all_buildings()
        if buildings:
            building_id = buildings[0]['id']
            building = self.manager.get_building(building_id)
            assert building is not None
            assert building['id'] == building_id

    def test_add_and_delete_building(self):
        new_building = {
            'name': 'Test Building',
            'address': '123 Test St',
            'type': 'commercial',
            'height': 20,
            'location': {'latitude': 31.2304, 'longitude': 121.4737},
            'roof_geometry': {
                'type': 'Polygon',
                'coordinates': [[
                    [121.4737, 31.2304],
                    [121.4740, 31.2304],
                    [121.4740, 31.2307],
                    [121.4737, 31.2307],
                    [121.4737, 31.2304]
                ]]
            }
        }

        building_id = self.manager.add_building(new_building)
        assert building_id is not None

        building = self.manager.get_building(building_id)
        assert building is not None
        assert building['name'] == 'Test Building'

        success = self.manager.delete_building(building_id)
        assert success is True

        deleted = self.manager.get_building(building_id)
        assert deleted is None

    def test_update_building_data(self):
        buildings = self.manager.get_all_buildings()
        if buildings:
            building_id = buildings[0]['id']
            analysis_data = {
                'radiation': {'annual_radiation_kwh_m2': 1200},
                'pv_potential': {'annual_ac_kwh': 10000}
            }

            success = self.manager.update_building_data(building_id, analysis_data)
            assert success is True

            updated = self.manager.get_building(building_id)
            assert 'last_analysis' in updated


class TestAPIEndpoints:
    def test_health_check(self, client):
        response = client.get('/api/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'

    def test_get_buildings(self, client):
        response = client.get('/api/buildings')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'buildings' in data
        assert isinstance(data['buildings'], list)

    def test_calculate_radiation(self, client):
        roof_geometry = {
            'type': 'Polygon',
            'coordinates': [[
                [121.4737, 31.2304],
                [121.4740, 31.2304],
                [121.4740, 31.2307],
                [121.4737, 31.2307],
                [121.4737, 31.2304]
            ]]
        }

        response = client.post('/api/calculate/radiation',
                               data=json.dumps({
                                   'building_id': 'test_001',
                                   'latitude': 31.2304,
                                   'longitude': 121.4737,
                                   'roof_geometry': roof_geometry,
                                   'tilt': 0,
                                   'azimuth': 180
                               }),
                               content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'radiation' in data
        assert 'heatmap' in data
        assert 'pv_potential' in data
        assert 'roof_properties' in data

    def test_calculate_radiation_missing_geometry(self, client):
        response = client.post('/api/calculate/radiation',
                               data=json.dumps({
                                   'building_id': 'test_001',
                                   'latitude': 31.2304,
                                   'longitude': 121.4737
                               }),
                               content_type='application/json')

        assert response.status_code == 400

    def test_analyze_roof(self, client):
        roof_geometry = {
            'type': 'Polygon',
            'coordinates': [[
                [121.4737, 31.2304],
                [121.4740, 31.2304],
                [121.4740, 31.2307],
                [121.4737, 31.2307],
                [121.4737, 31.2304]
            ]]
        }

        response = client.post('/api/analyze/roof',
                               data=json.dumps({
                                   'roof_geometry': roof_geometry,
                                   'tilt': 15,
                                   'azimuth': 180
                               }),
                               content_type='application/json')

        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'analysis' in data
        assert 'area' in data['analysis']
        assert 'roof_type' in data['analysis']


if __name__ == '__main__':
    print("Testing RadiationCalculator...")
    calc = RadiationCalculator()
    result = calc.calculate_annual_radiation(31.2304, 121.4737, 0, 180, 100)
    print(f"Annual Radiation: {result['annual_radiation_kwh_m2']:.2f} kWh/m²")
    print(f"Monthly Data Points: {len(result['monthly_radiation'])}")
    
    print("\nTesting GeometryAnalyzer...")
    analyzer = GeometryAnalyzer()
    test_roof = {
        'type': 'Polygon',
        'coordinates': [[
            [121.4737, 31.2304],
            [121.4740, 31.2304],
            [121.4740, 31.2307],
            [121.4737, 31.2307],
            [121.4737, 31.2304]
        ]]
    }
    analysis = analyzer.analyze_roof(test_roof, 0, 180)
    print(f"Roof Area: {analysis['area']:.2f} m²")
    print(f"Roof Type: {analysis['roof_type']}")
    
    print("\nTesting BuildingDataManager...")
    manager = BuildingDataManager()
    buildings = manager.get_all_buildings()
    print(f"Total Buildings: {len(buildings)}")
    stats = manager.get_building_stats()
    print(f"Stats: {stats}")
    
    print("\nAll tests completed successfully!")
