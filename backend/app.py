from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import json

from radiation_calculator import RadiationCalculator
from geometry_analyzer import GeometryAnalyzer
from building_data_manager import BuildingDataManager

app = Flask(__name__)
CORS(app)

radiation_calc = RadiationCalculator()
geo_analyzer = GeometryAnalyzer()
building_manager = BuildingDataManager()


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': 'Solar Potential API is running'})


@app.route('/api/buildings', methods=['GET'])
def get_buildings():
    buildings = building_manager.get_all_buildings()
    return jsonify({'buildings': buildings})


@app.route('/api/buildings/<building_id>', methods=['GET'])
def get_building(building_id):
    building = building_manager.get_building(building_id)
    if building:
        return jsonify({'building': building})
    return jsonify({'error': 'Building not found'}), 404


@app.route('/api/calculate/radiation', methods=['POST'])
def calculate_radiation():
    data = request.json

    building_id = data.get('building_id')
    latitude = data.get('latitude', 31.2304)
    longitude = data.get('longitude', 121.4737)
    roof_geometry = data.get('roof_geometry')
    user_tilt = data.get('tilt')
    user_azimuth = data.get('azimuth')
    enable_shadow = data.get('enable_shadow', True)
    day_of_year = data.get('day_of_year', 172)

    if not roof_geometry:
        return jsonify({'error': 'Roof geometry is required'}), 400

    roof_properties = geo_analyzer.analyze_roof(roof_geometry, tilt=user_tilt, azimuth=user_azimuth)

    effective_tilt = roof_properties['tilt']
    effective_azimuth = roof_properties['azimuth']

    hourly_shadow = None
    if enable_shadow:
        all_buildings = building_manager.get_all_buildings()
        if isinstance(all_buildings, list):
            building_dict = {b['id']: b for b in all_buildings}
        else:
            building_dict = all_buildings

        surrounding_buildings = []
        for b_id, b_data in building_dict.items():
            if b_id != building_id:
                b_geo = b_data.get('roof_geometry', {})
                b_height = b_data.get('height', 10)
                if b_geo:
                    surrounding_buildings.append({
                        'id': b_id,
                        'coordinates': b_geo.get('coordinates', [[]]),
                        'height': b_height
                    })

        if surrounding_buildings:
            hourly_shadow = geo_analyzer.calculate_hourly_shadow(
                roof_geometry,
                surrounding_buildings,
                latitude,
                longitude,
                day_of_year=day_of_year
            )

    radiation_result = radiation_calc.calculate_annual_radiation(
        latitude=latitude,
        longitude=longitude,
        tilt=effective_tilt,
        azimuth=effective_azimuth,
        roof_area=roof_properties['area'],
        roof_geometry=roof_geometry,
        hourly_shadow_factors=hourly_shadow
    )

    heatmap_data = geo_analyzer.generate_heatmap_grid(
        roof_geometry,
        radiation_result,
        grid_size=2,
        tilt=effective_tilt,
        azimuth=effective_azimuth
    )

    shadow_heatmap_data = None
    if hourly_shadow:
        shadow_heatmap_data = geo_analyzer.generate_shadow_heatmap(
            roof_geometry,
            hourly_shadow,
            hour=None,
            grid_size=2
        )

    pv_layout = geo_analyzer.calculate_optimal_pv_layout(
        roof_geometry,
        roof_properties,
        hourly_shadow=hourly_shadow
    )

    result = {
        'building_id': building_id,
        'location': {'latitude': latitude, 'longitude': longitude},
        'roof_properties': roof_properties,
        'radiation': radiation_result,
        'heatmap': heatmap_data,
        'shadow_heatmap': shadow_heatmap_data,
        'hourly_shadow': hourly_shadow,
        'pv_layout': pv_layout,
        'pv_potential': radiation_calc.estimate_pv_potential(
            radiation_result['annual_radiation'],
            roof_properties['area']
        )
    }

    building_manager.update_building_data(building_id, result)

    return jsonify(result)


@app.route('/api/calculate/shadow', methods=['POST'])
def calculate_shadow():
    data = request.json

    building_id = data.get('building_id')
    roof_geometry = data.get('roof_geometry')
    latitude = data.get('latitude', 31.2304)
    longitude = data.get('longitude', 121.4737)
    day_of_year = data.get('day_of_year', 172)
    hour = data.get('hour')

    if not roof_geometry:
        return jsonify({'error': 'Roof geometry is required'}), 400

    all_buildings = building_manager.get_all_buildings()
    if isinstance(all_buildings, list):
        building_dict = {b['id']: b for b in all_buildings}
    else:
        building_dict = all_buildings

    surrounding_buildings = []
    for b_id, b_data in building_dict.items():
        if b_id != building_id:
            b_geo = b_data.get('roof_geometry', {})
            b_height = b_data.get('height', 10)
            if b_geo:
                surrounding_buildings.append({
                    'id': b_id,
                    'coordinates': b_geo.get('coordinates', [[]]),
                    'height': b_height
                })

    hourly_shadow = geo_analyzer.calculate_hourly_shadow(
        roof_geometry,
        surrounding_buildings,
        latitude,
        longitude,
        day_of_year=day_of_year
    )

    shadow_heatmap = geo_analyzer.generate_shadow_heatmap(
        roof_geometry,
        hourly_shadow,
        hour=hour,
        grid_size=2
    )

    return jsonify({
        'hourly_shadow': hourly_shadow,
        'shadow_heatmap': shadow_heatmap,
        'surrounding_building_count': len(surrounding_buildings)
    })


@app.route('/api/calculate/layout', methods=['POST'])
def calculate_layout():
    data = request.json

    roof_geometry = data.get('roof_geometry')
    roof_properties = data.get('roof_properties', {})
    hourly_shadow = data.get('hourly_shadow')

    if not roof_geometry:
        return jsonify({'error': 'Roof geometry is required'}), 400

    if not roof_properties.get('tilt') or not roof_properties.get('azimuth'):
        analyzed = geo_analyzer.analyze_roof(roof_geometry)
        roof_properties.update({
            'tilt': analyzed['tilt'],
            'azimuth': analyzed['azimuth'],
            'area': analyzed['area'],
            'usable_area': analyzed['usable_area']
        })

    pv_layout = geo_analyzer.calculate_optimal_pv_layout(
        roof_geometry,
        roof_properties,
        hourly_shadow=hourly_shadow
    )

    return jsonify({'pv_layout': pv_layout})


@app.route('/api/calculate/heatmap', methods=['POST'])
def generate_heatmap():
    data = request.json

    roof_geometry = data.get('roof_geometry')
    radiation_data = data.get('radiation_data')
    grid_size = data.get('grid_size', 2)
    tilt = data.get('tilt', 0)
    azimuth = data.get('azimuth', 180)

    if not roof_geometry or not radiation_data:
        return jsonify({'error': 'Roof geometry and radiation data are required'}), 400

    heatmap_data = geo_analyzer.generate_heatmap_grid(
        roof_geometry,
        radiation_data,
        grid_size,
        tilt=tilt,
        azimuth=azimuth
    )

    return jsonify({'heatmap': heatmap_data})


@app.route('/api/analyze/roof', methods=['POST'])
def analyze_roof():
    data = request.json
    
    roof_geometry = data.get('roof_geometry')
    tilt = data.get('tilt', 0)
    azimuth = data.get('azimuth', 180)
    
    if not roof_geometry:
        return jsonify({'error': 'Roof geometry is required'}), 400
    
    analysis = geo_analyzer.analyze_roof(roof_geometry, tilt, azimuth)
    
    return jsonify({'analysis': analysis})


@app.route('/api/buildings', methods=['POST'])
def add_building():
    data = request.json
    building_id = building_manager.add_building(data)
    return jsonify({'building_id': building_id, 'message': 'Building added successfully'})


@app.route('/api/buildings/<building_id>', methods=['PUT'])
def update_building(building_id):
    data = request.json
    success = building_manager.update_building(building_id, data)
    if success:
        return jsonify({'message': 'Building updated successfully'})
    return jsonify({'error': 'Building not found'}), 404


@app.route('/api/buildings/<building_id>', methods=['DELETE'])
def delete_building(building_id):
    success = building_manager.delete_building(building_id)
    if success:
        return jsonify({'message': 'Building deleted successfully'})
    return jsonify({'error': 'Building not found'}), 404


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
