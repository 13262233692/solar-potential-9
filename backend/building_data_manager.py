import json
import os
import uuid
import math
from datetime import datetime


class BuildingDataManager:
    def __init__(self, data_file='buildings.json'):
        self.data_file = os.path.join(os.path.dirname(__file__), data_file)
        self.buildings = self._load_data()

    def _load_data(self):
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {}
        else:
            default_data = self._create_sample_data()
            self._save_data(default_data)
            return default_data

    def _save_data(self, data=None):
        if data is None:
            data = self.buildings
        try:
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except IOError:
            return False

    def _create_sample_data(self):
        center_lat = 31.2304
        center_lon = 121.4737

        sample_buildings = {}

        for i in range(5):
            building_id = f"building_{i+1:03d}"

            lat_offset = (i - 2) * 0.001
            lon_offset = (i % 3 - 1) * 0.001

            lat = center_lat + lat_offset
            lon = center_lon + lon_offset

            size = 0.0003 + (i % 3) * 0.0001

            height = 15 + (i * 5)

            roof_tilt = [0, 25, 20, 0, 5][i % 5]
            roof_azimuth = 180
            roof_type = ['flat', 'gable', 'hip', 'flat', 'flat'][i % 5]

            if roof_tilt > 0:
                tilt_rad = math.radians(roof_tilt)
                azimuth_rad = math.radians(roof_azimuth)
                dz_center = size * math.sin(tilt_rad)

                nx = math.sin(tilt_rad) * math.sin(azimuth_rad)
                ny = math.sin(tilt_rad) * math.cos(azimuth_rad)
                nz = math.cos(tilt_rad)

                corners_local = [
                    (-size, -size),
                    (size, -size),
                    (size, size),
                    (-size, size)
                ]

                coordinates = []
                for dx, dy in corners_local:
                    z = height + dz_center * (dx * nx / size + dy * ny / size)
                    coordinates.append([lon + dx, lat + dy, round(z, 2)])
                coordinates.append([coordinates[0][0], coordinates[0][1], coordinates[0][2]])
            else:
                coordinates = [
                    [lon - size, lat - size, height],
                    [lon + size, lat - size, height],
                    [lon + size, lat + size, height],
                    [lon - size, lat + size, height],
                    [lon - size, lat - size, height]
                ]

            sample_buildings[building_id] = {
                'id': building_id,
                'name': f"Building {i+1}",
                'address': f"{100 + i * 10} Main Street",
                'type': ['commercial', 'residential', 'industrial', 'public', 'mixed'][i % 5],
                'construction_year': 1990 + i * 5,
                'floors': 3 + i,
                'height': height,
                'roof_type': roof_type,
                'roof_tilt': roof_tilt,
                'roof_azimuth': roof_azimuth,
                'location': {
                    'latitude': lat,
                    'longitude': lon
                },
                'roof_geometry': {
                    'type': 'Polygon',
                    'coordinates': [coordinates]
                },
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }

        return sample_buildings

    def get_all_buildings(self):
        return list(self.buildings.values())

    def get_building(self, building_id):
        return self.buildings.get(building_id)

    def add_building(self, building_data):
        building_id = building_data.get('id') or f"building_{uuid.uuid4().hex[:8]}"
        
        if building_id in self.buildings:
            building_id = f"{building_id}_{uuid.uuid4().hex[:4]}"
        
        building_data['id'] = building_id
        building_data['created_at'] = datetime.now().isoformat()
        building_data['updated_at'] = datetime.now().isoformat()
        
        self.buildings[building_id] = building_data
        self._save_data()
        
        return building_id

    def update_building(self, building_id, building_data):
        if building_id not in self.buildings:
            return False
        
        building_data['id'] = building_id
        building_data['updated_at'] = datetime.now().isoformat()
        
        self.buildings[building_id].update(building_data)
        self._save_data()
        
        return True

    def delete_building(self, building_id):
        if building_id not in self.buildings:
            return False
        
        del self.buildings[building_id]
        self._save_data()
        
        return True

    def update_building_data(self, building_id, analysis_data):
        if building_id not in self.buildings:
            return False
        
        self.buildings[building_id]['last_analysis'] = analysis_data
        self.buildings[building_id]['last_analysis_at'] = datetime.now().isoformat()
        self.buildings[building_id]['updated_at'] = datetime.now().isoformat()
        
        self._save_data()
        
        return True

    def get_building_roof_geometry(self, building_id):
        building = self.buildings.get(building_id)
        if not building:
            return None
        return building.get('roof_geometry')

    def search_buildings(self, query=None, bounds=None, building_type=None):
        results = list(self.buildings.values())
        
        if query:
            query_lower = query.lower()
            results = [
                b for b in results
                if query_lower in b.get('name', '').lower() or
                   query_lower in b.get('address', '').lower()
            ]
        
        if bounds:
            min_lat, max_lat, min_lon, max_lon = bounds
            results = [
                b for b in results
                if min_lat <= b['location']['latitude'] <= max_lat and
                   min_lon <= b['location']['longitude'] <= max_lon
            ]
        
        if building_type:
            results = [b for b in results if b.get('type') == building_type]
        
        return results

    def get_building_stats(self):
        total_buildings = len(self.buildings)
        
        if total_buildings == 0:
            return {
                'total_buildings': 0,
                'total_area': 0,
                'total_potential_kwh': 0,
                'by_type': {},
                'analyzed_count': 0
            }
        
        types = {}
        total_area = 0
        total_potential = 0
        analyzed_count = 0
        
        for building in self.buildings.values():
            b_type = building.get('type', 'unknown')
            types[b_type] = types.get(b_type, 0) + 1
            
            roof_geo = building.get('roof_geometry', {})
            if roof_geo:
                coords = roof_geo.get('coordinates', [[]])[0]
                if len(coords) >= 3:
                    area = self._estimate_area(coords)
                    total_area += area
            
            if 'last_analysis' in building:
                analyzed_count += 1
                potential = building['last_analysis'].get('pv_potential', {})
                total_potential += potential.get('annual_ac_kwh', 0)
        
        return {
            'total_buildings': total_buildings,
            'total_roof_area_sq_m': total_area,
            'total_potential_kwh': total_potential,
            'by_type': types,
            'analyzed_count': analyzed_count,
            'average_height': sum(b.get('height', 0) for b in self.buildings.values()) / total_buildings
        }

    def _estimate_area(self, coordinates):
        if len(coordinates) < 3:
            return 0
        
        lats = [c[1] for c in coordinates]
        lons = [c[0] for c in coordinates]
        
        avg_lat = sum(lats) / len(lats)
        
        lat_range = max(lats) - min(lats)
        lon_range = max(lons) - min(lons)
        
        lat_meters = lat_range * 111320
        lon_meters = lon_range * 111320 * 0.866
        
        return lat_meters * lon_meters * 0.9

    def export_data(self, format='json', building_ids=None):
        if building_ids:
            data = {bid: self.buildings[bid] for bid in building_ids if bid in self.buildings}
        else:
            data = self.buildings
        
        if format == 'json':
            return json.dumps(list(data.values()), indent=2, ensure_ascii=False)
        elif format == 'geojson':
            features = []
            for building in data.values():
                features.append({
                    'type': 'Feature',
                    'id': building['id'],
                    'geometry': building.get('roof_geometry', {}),
                    'properties': {
                        k: v for k, v in building.items() if k != 'roof_geometry'
                    }
                })
            return json.dumps({
                'type': 'FeatureCollection',
                'features': features
            }, indent=2, ensure_ascii=False)
        
        return json.dumps(list(data.values()), indent=2, ensure_ascii=False)

    def import_data(self, data, format='json', overwrite=False):
        try:
            if format == 'json':
                buildings = json.loads(data)
            elif format == 'geojson':
                geojson_data = json.loads(data)
                buildings = []
                for feature in geojson_data.get('features', []):
                    building = feature.get('properties', {})
                    building['roof_geometry'] = feature.get('geometry', {})
                    building['id'] = feature.get('id', building.get('id'))
                    buildings.append(building)
            else:
                return False, "Unsupported format"
            
            count = 0
            for building in buildings:
                building_id = building.get('id')
                
                if not building_id:
                    building_id = f"building_{uuid.uuid4().hex[:8]}"
                    building['id'] = building_id
                
                if building_id in self.buildings and not overwrite:
                    continue
                
                building['created_at'] = building.get('created_at', datetime.now().isoformat())
                building['updated_at'] = datetime.now().isoformat()
                
                self.buildings[building_id] = building
                count += 1
            
            self._save_data()
            
            return True, f"Imported {count} buildings"
            
        except json.JSONDecodeError:
            return False, "Invalid JSON data"
        except Exception as e:
            return False, str(e)

    def get_analysis_history(self, building_id):
        building = self.buildings.get(building_id)
        if not building:
            return None
        
        history = building.get('analysis_history', [])
        
        if 'last_analysis' in building and 'last_analysis_at' in building:
            history.append({
                'timestamp': building['last_analysis_at'],
                'data': building['last_analysis']
            })
        
        return history

    def batch_analyze(self, building_ids=None):
        if building_ids is None:
            building_ids = list(self.buildings.keys())
        
        results = []
        for building_id in building_ids:
            building = self.buildings.get(building_id)
            if building:
                results.append({
                    'building_id': building_id,
                    'name': building.get('name'),
                    'ready_for_analysis': 'roof_geometry' in building,
                    'has_analysis': 'last_analysis' in building
                })
        
        return results
