import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import triangulate
import geojson
import math


class GeometryAnalyzer:
    def __init__(self):
        self.earth_radius = 6371000

    def analyze_roof(self, roof_geometry, tilt=None, azimuth=None):
        geometry_type = roof_geometry.get('type', 'Polygon')

        if geometry_type == 'Polygon':
            coordinates = roof_geometry.get('coordinates', [[]])[0]
        elif geometry_type == 'MultiPolygon':
            coordinates = roof_geometry.get('coordinates', [[[]]])[0][0]
        else:
            coordinates = roof_geometry.get('coordinates', [])

        if not coordinates or len(coordinates) < 3:
            return {
                'area': 0,
                'perimeter': 0,
                'centroid': {'latitude': 0, 'longitude': 0},
                'tilt': tilt or 0,
                'azimuth': azimuth or 180,
                'roof_type': 'flat',
                'complexity': 'simple',
                'aspect_ratio': 1,
                'orientation': self._get_orientation_name(azimuth or 180),
                'normal_vector': [0, 0, 1]
            }

        has_z = any(len(c) >= 3 for c in coordinates)

        computed_tilt = tilt
        computed_azimuth = azimuth
        normal_vector = [0.0, 0.0, 1.0]

        if has_z:
            normal_result = self._compute_roof_normal(coordinates)
            if normal_result is not None:
                normal_vector = normal_result['normal']
                computed_tilt = normal_result['tilt']
                computed_azimuth = normal_result['azimuth']

        if computed_tilt is None:
            computed_tilt = 0
        if computed_azimuth is None:
            computed_azimuth = 180

        if not has_z and tilt is not None:
            computed_tilt = tilt
        if not has_z and azimuth is not None:
            computed_azimuth = azimuth

        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        polygon = Polygon(coords_2d)

        horizontal_area = self._calculate_geographic_area(coords_2d)
        cos_tilt = math.cos(math.radians(computed_tilt))
        if cos_tilt > 0.01:
            actual_area = horizontal_area / cos_tilt
        else:
            actual_area = horizontal_area

        perimeter = self._calculate_geographic_perimeter(coords_2d)

        centroid = polygon.centroid
        center_lat = centroid.y
        center_lon = centroid.x

        roof_type = self._classify_roof_type(coordinates, computed_tilt)
        complexity = self._assess_complexity(coords_2d)
        aspect_ratio = self._calculate_aspect_ratio(coords_2d)

        bounding_box = self._get_bounding_box(coords_2d)

        roof_segments = self._identify_roof_segments(coordinates, computed_tilt)

        return {
            'area': actual_area,
            'area_sq_m': actual_area,
            'area_sq_ft': actual_area * 10.7639,
            'horizontal_area': horizontal_area,
            'perimeter': perimeter,
            'centroid': {
                'latitude': center_lat,
                'longitude': center_lon
            },
            'tilt': computed_tilt,
            'azimuth': computed_azimuth,
            'orientation': self._get_orientation_name(computed_azimuth),
            'roof_type': roof_type,
            'complexity': complexity,
            'aspect_ratio': aspect_ratio,
            'bounding_box': bounding_box,
            'segments': roof_segments,
            'vertex_count': len(coordinates),
            'usable_area': actual_area * 0.85,
            'slope_info': self._calculate_slope_info(computed_tilt),
            'normal_vector': normal_vector
        }

    def _compute_roof_normal(self, coordinates):
        coords_3d = []
        for c in coordinates:
            if len(c) >= 3:
                coords_3d.append((c[0], c[1], c[2]))
            else:
                coords_3d.append((c[0], c[1], 0.0))

        if len(coords_3d) < 3:
            return None

        avg_lat = np.mean([c[1] for c in coords_3d])
        lat_m = 111320.0
        lon_m = 111320.0 * math.cos(math.radians(avg_lat))

        local_coords = []
        for lon, lat, z in coords_3d:
            x = (lon - coords_3d[0][0]) * lon_m
            y = (lat - coords_3d[0][1]) * lat_m
            local_coords.append(np.array([x, y, z]))

        n = len(local_coords)
        normal_sum = np.array([0.0, 0.0, 0.0])
        count = 0

        for i in range(n - 1):
            v1 = local_coords[i + 1] - local_coords[0]
            v2 = local_coords[i] - local_coords[0]
            cross = np.cross(v1, v2)
            norm = np.linalg.norm(cross)
            if norm > 1e-10:
                cross = cross / norm
                normal_sum += cross
                count += 1

        if count == 0:
            return None

        normal = normal_sum / np.linalg.norm(normal_sum)

        if normal[2] < 0:
            normal = -normal

        tilt = math.degrees(math.acos(np.clip(normal[2], -1.0, 1.0)))

        nx, ny = normal[0], normal[1]
        azimuth = math.degrees(math.atan2(nx, ny))
        if azimuth < 0:
            azimuth += 360.0

        return {
            'normal': normal.tolist(),
            'tilt': round(tilt, 2),
            'azimuth': round(azimuth, 2)
        }

    def _calculate_geographic_area(self, coordinates):
        if len(coordinates) < 3:
            return 0
        
        n = len(coordinates)
        area = 0.0
        
        for i in range(n):
            j = (i + 1) % n
            lat1, lon1 = coordinates[i][1], coordinates[i][0]
            lat2, lon2 = coordinates[j][1], coordinates[j][0]
            
            area += math.radians(lon2 - lon1) * (
                2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
            )
        
        area = abs(area * self.earth_radius * self.earth_radius / 2.0)
        
        return area

    def _calculate_geographic_perimeter(self, coordinates):
        perimeter = 0.0
        n = len(coordinates)
        
        for i in range(n):
            j = (i + 1) % n
            lat1, lon1 = coordinates[i][1], coordinates[i][0]
            lat2, lon2 = coordinates[j][1], coordinates[j][0]
            
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            
            a = math.sin(dlat / 2) ** 2 + \
                math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
                math.sin(dlon / 2) ** 2
            
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            perimeter += self.earth_radius * c
        
        return perimeter

    def _classify_roof_type(self, coordinates, tilt):
        if len(coordinates) < 4:
            return 'irregular'
        
        if tilt < 5:
            return 'flat'
        elif tilt < 15:
            return 'low_slope'
        elif tilt < 30:
            return 'moderate_slope'
        elif tilt < 45:
            return 'steep_slope'
        else:
            return 'very_steep'

    def _assess_complexity(self, coordinates):
        n = len(coordinates)
        
        if n <= 4:
            return 'simple'
        elif n <= 8:
            return 'moderate'
        elif n <= 16:
            return 'complex'
        else:
            return 'very_complex'

    def _calculate_aspect_ratio(self, coordinates):
        lats = [coord[1] for coord in coordinates]
        lons = [coord[0] for coord in coordinates]
        
        lat_range = max(lats) - min(lats)
        lon_range = max(lons) - min(lons)
        
        if lat_range == 0 or lon_range == 0:
            return 1.0
        
        avg_lat = sum(lats) / len(lats)
        lat_meters = lat_range * 111320
        lon_meters = lon_range * 111320 * math.cos(math.radians(avg_lat))
        
        ratio = max(lat_meters, lon_meters) / min(lat_meters, lon_meters)
        
        return round(ratio, 2)

    def _estimate_roof_azimuth(self, coordinates):
        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]

        lats = [c[1] for c in coords_2d]
        lons = [c[0] for c in coords_2d]

        d_lat = max(lats) - min(lats)
        d_lon = max(lons) - min(lons)

        avg_lat = sum(lats) / len(lats)
        d_lat_m = d_lat * 111320
        d_lon_m = d_lon * 111320 * math.cos(math.radians(avg_lat))

        if d_lat_m == 0 and d_lon_m == 0:
            return 180

        azimuth = math.degrees(math.atan2(d_lon_m, d_lat_m))
        if azimuth < 0:
            azimuth += 360.0

        return azimuth

    def _get_orientation_name(self, azimuth):
        directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        index = int((azimuth + 22.5) / 45) % 8
        return directions[index]

    def _get_bounding_box(self, coordinates):
        lats = [coord[1] for coord in coordinates]
        lons = [coord[0] for coord in coordinates]
        
        return {
            'min_latitude': min(lats),
            'max_latitude': max(lats),
            'min_longitude': min(lons),
            'max_longitude': max(lons)
        }

    def _calculate_slope_info(self, tilt):
        radians = math.radians(tilt)
        return {
            'tilt_degrees': tilt,
            'tilt_radians': radians,
            'rise_over_run': math.tan(radians),
            'pitch': f"{int(tilt * 12 / 90)}/12",
            'roof_factor': 1 / math.cos(radians)
        }

    def _identify_roof_segments(self, coordinates, base_tilt):
        segments = []
        
        if len(coordinates) < 4:
            return segments
        
        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        
        triangles = triangulate(Polygon(coords_2d))
        
        for i, triangle in enumerate(triangles):
            area = self._calculate_geographic_area(list(triangle.exterior.coords))
            
            if area < 1:
                continue
            
            centroid = triangle.centroid
            
            segments.append({
                'segment_id': i + 1,
                'area': area,
                'centroid': {
                    'latitude': centroid.y,
                    'longitude': centroid.x
                },
                'tilt': base_tilt,
                'azimuth': self._estimate_segment_azimuth(triangle),
                'vertices': list(triangle.exterior.coords)[:-1]
            })
        
        return segments

    def _estimate_segment_azimuth(self, triangle):
        coords = list(triangle.exterior.coords)[:-1]
        
        lats = [c[1] for c in coords]
        lons = [c[0] for c in coords]
        
        d_lat = max(lats) - min(lats)
        d_lon = max(lons) - min(lons)
        
        if d_lat == 0 and d_lon == 0:
            return 180
        
        angle = math.degrees(math.atan2(d_lon, d_lat))
        if angle < 0:
            angle += 360
        
        return angle

    def generate_heatmap_grid(self, roof_geometry, radiation_data, grid_size=2, tilt=0, azimuth=180):
        geometry_type = roof_geometry.get('type', 'Polygon')

        if geometry_type == 'Polygon':
            coordinates = roof_geometry.get('coordinates', [[]])[0]
        elif geometry_type == 'MultiPolygon':
            coordinates = roof_geometry.get('coordinates', [[[]]])[0][0]
        else:
            coordinates = roof_geometry.get('coordinates', [])

        if len(coordinates) < 3:
            return {'grid': [], 'min_value': 0, 'max_value': 0, 'grid_size': grid_size}

        has_z = any(len(c) >= 3 for c in coordinates)

        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        polygon = Polygon(coords_2d)

        bbox = self._get_bounding_box(coords_2d)

        avg_lat = (bbox['min_latitude'] + bbox['max_latitude']) / 2
        lat_step = grid_size / 111320
        lon_step = grid_size / (111320 * math.cos(math.radians(avg_lat)))

        if isinstance(radiation_data, list):
            annual_radiation = sum(r.get('radiation_kwh_m2', 0) for r in radiation_data)
        elif isinstance(radiation_data, dict):
            annual_radiation = radiation_data.get('annual_radiation_kwh_m2', 1200)
        else:
            annual_radiation = 1200

        grid_points = []
        values = []

        lat = bbox['min_latitude']
        while lat <= bbox['max_latitude']:
            lon = bbox['min_longitude']
            while lon <= bbox['max_longitude']:
                point = Point(lon, lat)

                if polygon.contains(point) or polygon.touches(point):
                    local_factor = self._calculate_local_radiation_factor(
                        lat, lon, coords_2d, avg_lat, tilt, azimuth
                    )

                    point_radiation = annual_radiation * local_factor

                    z_val = None
                    if has_z:
                        z_val = self._interpolate_height(lon, lat, coordinates)

                    grid_point = {
                        'latitude': lat,
                        'longitude': lon,
                        'value': point_radiation,
                        'value_kwh_m2': point_radiation
                    }
                    if z_val is not None:
                        grid_point['height'] = z_val

                    grid_points.append(grid_point)
                    values.append(point_radiation)

                lon += lon_step
            lat += lat_step

        if not values:
            return {'grid': [], 'min_value': 0, 'max_value': 0, 'grid_size': grid_size}

        return {
            'grid': grid_points,
            'min_value': min(values),
            'max_value': max(values),
            'avg_value': sum(values) / len(values),
            'grid_size': grid_size,
            'point_count': len(grid_points),
            'tilt': tilt,
            'azimuth': azimuth,
            'color_scale': self._generate_color_scale(min(values), max(values))
        }

    def _interpolate_height(self, lon, lat, coordinates):
        coords_3d = [(c[0], c[1], c[2] if len(c) >= 3 else 0.0) for c in coordinates]
        if not coords_3d:
            return None

        min_dist = float('inf')
        nearest_z = 0.0
        for c_lon, c_lat, c_z in coords_3d:
            d = (c_lon - lon) ** 2 + (c_lat - lat) ** 2
            if d < min_dist:
                min_dist = d
                nearest_z = c_z

        return nearest_z

    def _calculate_local_radiation_factor(self, lat, lon, polygon_coords, avg_lat, tilt=0, azimuth=180):
        centroid_lat = sum(c[1] for c in polygon_coords) / len(polygon_coords)
        centroid_lon = sum(c[0] for c in polygon_coords) / len(polygon_coords)

        d_lat = (lat - centroid_lat) * 111320
        d_lon = (lon - centroid_lon) * 111320 * math.cos(math.radians(avg_lat))
        distance = math.sqrt(d_lat * d_lat + d_lon * d_lon)

        max_distance = 0
        for coord in polygon_coords:
            c_lat = (coord[1] - centroid_lat) * 111320
            c_lon = (coord[0] - centroid_lon) * 111320 * math.cos(math.radians(avg_lat))
            c_dist = math.sqrt(c_lat * c_lat + c_lon * c_lon)
            if c_dist > max_distance:
                max_distance = c_dist

        if max_distance == 0:
            return 1.0

        edge_factor = 1.0 - 0.1 * (distance / max_distance)

        if tilt > 0 and distance > 0:
            azimuth_rad = math.radians(azimuth)
            point_angle = math.degrees(math.atan2(d_lon, d_lat))
            angle_diff = math.cos(math.radians(point_angle - azimuth_rad))
            tilt_effect = 1.0 + 0.08 * (tilt / 45.0) * angle_diff * (distance / max_distance)
        else:
            tilt_effect = 1.0

        random_factor = 0.97 + np.random.random() * 0.06

        return edge_factor * tilt_effect * random_factor

    def _generate_color_scale(self, min_val, max_val):
        colors = [
            {'value': min_val, 'color': '#2c7bb6', 'name': 'Low'},
            {'value': min_val + (max_val - min_val) * 0.25, 'color': '#00a6ca', 'name': 'Medium-Low'},
            {'value': min_val + (max_val - min_val) * 0.5, 'color': '#ffffbf', 'name': 'Medium'},
            {'value': min_val + (max_val - min_val) * 0.75, 'color': '#fdae61', 'name': 'Medium-High'},
            {'value': max_val, 'color': '#d7191c', 'name': 'High'}
        ]
        return colors

    def extract_roof_geometry_from_3dtiles(self, feature_data):
        coordinates = feature_data.get('coordinates', [])
        height = feature_data.get('height', 10)
        minimum_height = feature_data.get('minimumHeight', 0)
        
        roof_height = minimum_height + height
        
        if len(coordinates) >= 3:
            roof_coords = []
            for coord in coordinates:
                if len(coord) >= 3:
                    roof_coords.append([coord[0], coord[1], roof_height])
                else:
                    roof_coords.append([coord[0], coord[1], roof_height])
            
            return {
                'type': 'Polygon',
                'coordinates': [roof_coords],
                'roof_height': roof_height,
                'building_height': height
            }
        
        return None

    def simplify_geometry(self, coordinates, tolerance=0.00001):
        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        polygon = Polygon(coords_2d)
        simplified = polygon.simplify(tolerance, preserve_topology=True)
        
        simplified_coords = []
        for coord in list(simplified.exterior.coords):
            if len(coordinates[0]) >= 3:
                simplified_coords.append([coord[0], coord[1], coordinates[0][2]])
            else:
                simplified_coords.append([coord[0], coord[1]])
        
        return simplified_coords

    def calculate_shadow_impact(self, roof_geometry, surrounding_buildings, time_of_day=None):
        roof_coords = roof_geometry.get('coordinates', [[]])[0]
        roof_polygon = Polygon([(lon, lat) for lon, lat, *_ in roof_coords])
        roof_centroid = roof_polygon.centroid

        shadow_impact = 0

        for building in surrounding_buildings:
            b_coords = building.get('coordinates', [[]])[0]
            b_height = building.get('height', 10)
            b_polygon = Polygon([(lon, lat) for lon, lat, *_ in b_coords])
            b_centroid = b_polygon.centroid

            distance = roof_centroid.distance(b_centroid) * 111320

            if distance < b_height * 3:
                shadow_ratio = b_height / max(distance, 1) * 0.5
                shadow_impact += min(shadow_ratio, 0.3)

        shadow_impact = min(shadow_impact, 0.5)

        return {
            'shadow_factor': 1 - shadow_impact,
            'shadow_impact_percentage': shadow_impact * 100,
            'effective_radiation_factor': 1 - shadow_impact
        }

    def calculate_hourly_shadow(self, roof_geometry, surrounding_buildings,
                                latitude, longitude, day_of_year=172):
        """
        按小时计算屋顶的阴影遮挡情况
        """
        roof_coords = roof_geometry.get('coordinates', [[]])[0]
        if len(roof_coords) < 3:
            return []

        coords_2d = [(lon, lat) for lon, lat, *_ in roof_coords]
        roof_polygon = Polygon(coords_2d)
        bbox = self._get_bounding_box(coords_2d)
        avg_lat = (bbox['min_latitude'] + bbox['max_latitude']) / 2
        lat_m = 111320.0
        lon_m = 111320.0 * math.cos(math.radians(avg_lat))

        roof_height = 0
        for coord in roof_coords:
            if len(coord) >= 3:
                roof_height = max(roof_height, coord[2])

        sample_points = self._generate_roof_sample_points(roof_polygon, bbox, avg_lat, roof_coords)

        hourly_results = []
        for hour in range(24):
            sun_pos = self._calculate_sun_position(latitude, longitude, day_of_year, hour)

            if sun_pos['elevation'] <= 0:
                hourly_results.append({
                    'hour': hour,
                    'sun_elevation': 0,
                    'sun_azimuth': 0,
                    'shadow_coverage': 1.0,
                    'shadow_factor': 0.0,
                    'effective_radiation': 0.0,
                    'shadow_regions': []
                })
                continue

            shadow_regions = []
            total_roof_area = roof_polygon.area
            shadowed_area = 0

            for building in surrounding_buildings:
                b_coords = building.get('coordinates', [[]])[0]
                b_height = building.get('height', 10)
                b_polygon = Polygon([(lon, lat) for lon, lat, *_ in b_coords])

                shadow_polygon = self._project_building_shadow(
                    b_polygon, b_height, sun_pos['elevation'], sun_pos['azimuth']
                )

                if shadow_polygon is not None and roof_polygon.intersects(shadow_polygon):
                    intersection = roof_polygon.intersection(shadow_polygon)
                    inter_area = intersection.area
                    shadowed_area += inter_area

                    shadow_regions.append({
                        'building_id': building.get('id', 'unknown'),
                        'building_height': b_height,
                        'coverage_ratio': min(inter_area / max(total_roof_area, 1e-9), 1.0),
                        'shadow_polygon_coords': list(intersection.exterior.coords) if hasattr(intersection, 'exterior') else []
                    })

            shadow_coverage = min(shadowed_area / max(total_roof_area, 1e-9), 1.0)
            shadow_factor = 1.0 - shadow_coverage * 0.85

            hourly_results.append({
                'hour': hour,
                'sun_elevation': sun_pos['elevation'],
                'sun_azimuth': sun_pos['azimuth'],
                'shadow_coverage': shadow_coverage,
                'shadow_factor': shadow_factor,
                'effective_radiation_factor': shadow_factor,
                'shadow_regions': shadow_regions
            })

        return hourly_results

    def _generate_roof_sample_points(self, roof_polygon, bbox, avg_lat, roof_coords, grid_size=3):
        """生成屋顶采样点用于精细阴影计算"""
        lat_step = grid_size / 111320
        lon_step = grid_size / (111320 * math.cos(math.radians(avg_lat)))

        points = []
        lat = bbox['min_latitude']
        while lat <= bbox['max_latitude']:
            lon = bbox['min_longitude']
            while lon <= bbox['max_longitude']:
                point = Point(lon, lat)
                if roof_polygon.contains(point) or roof_polygon.touches(point):
                    z_val = None
                    if any(len(c) >= 3 for c in roof_coords):
                        z_val = self._interpolate_height(lon, lat, roof_coords)
                    points.append({
                        'latitude': lat,
                        'longitude': lon,
                        'height': z_val
                    })
                lon += lon_step
            lat += lat_step

        return points

    def _calculate_sun_position(self, latitude, longitude, day_of_year, hour):
        """简化的太阳位置计算"""
        declination = 23.45 * math.sin(math.radians(360 / 365 * (day_of_year - 81)))

        hour_angle = 15 * (hour - 12)

        lat_rad = math.radians(latitude)
        dec_rad = math.radians(declination)
        ha_rad = math.radians(hour_angle)

        sin_elev = (math.sin(lat_rad) * math.sin(dec_rad) +
                    math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad))
        sin_elev = max(-1.0, min(1.0, sin_elev))
        elevation = math.degrees(math.asin(sin_elev))

        cos_azimuth = ((math.sin(dec_rad) - math.sin(lat_rad) * sin_elev) /
                       (math.cos(lat_rad) * math.cos(math.asin(sin_elev))))
        cos_azimuth = max(-1.0, min(1.0, cos_azimuth))
        azimuth = math.degrees(math.acos(cos_azimuth))

        if hour_angle > 0:
            azimuth = 360 - azimuth

        return {
            'elevation': elevation,
            'azimuth': azimuth,
            'declination': declination,
            'hour_angle': hour_angle
        }

    def _project_building_shadow(self, building_polygon, building_height,
                                 sun_elevation, sun_azimuth):
        """根据太阳位置计算建筑的阴影投影多边形"""
        if sun_elevation <= 0:
            return None

        elevation_rad = math.radians(sun_elevation)
        azimuth_rad = math.radians(sun_azimuth)

        shadow_length = building_height / math.tan(elevation_rad)

        dx = shadow_length * math.sin(azimuth_rad) / 111320.0
        dy = shadow_length * math.cos(azimuth_rad) / (111320.0 * 0.866)

        coords = list(building_polygon.exterior.coords)[:-1]

        shadow_coords = []
        for lon, lat in coords:
            shadow_coords.append((lon + dx, lat + dy))

        full_coords = coords + shadow_coords[::-1]
        if len(full_coords) >= 3:
            try:
                shadow_polygon = Polygon(full_coords)
                if shadow_polygon.is_valid:
                    return shadow_polygon
            except:
                pass

        return None

    def calculate_optimal_pv_layout(self, roof_geometry, roof_properties, hourly_shadow=None):
        """
        计算最佳光伏板布局建议
        """
        geometry_type = roof_geometry.get('type', 'Polygon')
        if geometry_type == 'Polygon':
            coordinates = roof_geometry.get('coordinates', [[]])[0]
        elif geometry_type == 'MultiPolygon':
            coordinates = roof_geometry.get('coordinates', [[[]]])[0][0]
        else:
            coordinates = roof_geometry.get('coordinates', [])

        if len(coordinates) < 3:
            return None

        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        polygon = Polygon(coords_2d)
        bbox = self._get_bounding_box(coords_2d)
        avg_lat = (bbox['min_latitude'] + bbox['max_latitude']) / 2

        tilt = roof_properties.get('tilt', 0)
        azimuth = roof_properties.get('azimuth', 180)
        roof_area = roof_properties.get('area', 0)
        usable_area = roof_properties.get('usable_area', roof_area * 0.85)

        if hourly_shadow:
            avg_shadow_factor = sum(
                h['shadow_factor'] for h in hourly_shadow if h['sun_elevation'] > 10
            ) / max(len([h for h in hourly_shadow if h['sun_elevation'] > 10]), 1)
            min_shadow_hours = []
            for h in hourly_shadow:
                if h['sun_elevation'] > 10 and h['shadow_coverage'] < 0.3:
                    min_shadow_hours.append(h['hour'])
            best_hours = min_shadow_hours
        else:
            avg_shadow_factor = 0.85
            best_hours = list(range(9, 16))

        pv_width = 1.0
        pv_height = 1.7
        pv_area = pv_width * pv_height
        pv_power = 0.4

        tilt_rad = math.radians(tilt)
        spacing_factor = 2.5 if tilt > 10 else 1.5
        row_spacing = pv_height * spacing_factor

        lat_step = pv_width / 111320.0
        lon_step = row_spacing / (111320.0 * math.cos(math.radians(avg_lat)))

        panels = []
        total_capacity = 0

        min_lat = bbox['min_latitude'] + lat_step
        max_lat = bbox['max_latitude'] - lat_step
        min_lon = bbox['min_longitude'] + lon_step
        max_lon = bbox['max_longitude'] - lon_step

        lat = min_lat
        row = 0
        while lat <= max_lat:
            lon = min_lon
            col = 0
            while lon <= max_lon:
                center_lon = lon + lon_step / 2
                center_lat = lat + lat_step / 2
                point = Point(center_lon, center_lat)

                if polygon.contains(point) or polygon.touches(point):
                    local_shadow = 1.0
                    if hourly_shadow:
                        local_shadow = avg_shadow_factor

                    if local_shadow >= 0.7:
                        corners = [
                            [center_lon - lon_step / 2, center_lat - lat_step / 2],
                            [center_lon + lon_step / 2, center_lat - lat_step / 2],
                            [center_lon + lon_step / 2, center_lat + lat_step / 2],
                            [center_lon - lon_step / 2, center_lat + lat_step / 2],
                            [center_lon - lon_step / 2, center_lat - lat_step / 2]
                        ]

                        panels.append({
                            'panel_id': f'PV_{row}_{col}',
                            'row': row,
                            'column': col,
                            'center': {'longitude': center_lon, 'latitude': center_lat},
                            'corners': corners,
                            'area': pv_area,
                            'power_kw': pv_power,
                            'efficiency': 0.20,
                            'tilt': tilt,
                            'azimuth': azimuth,
                            'shadow_factor': local_shadow,
                            'estimated_annual_kwh': pv_power * 1200 * local_shadow
                        })
                        total_capacity += pv_power
                        col += 1

                lon += lon_step
            row += 1
            lat += lat_step

        total_panels = len(panels)
        total_estimated_kwh = sum(p['estimated_annual_kwh'] for p in panels)

        recommendations = []

        if tilt < 5:
            recommendations.append({
                'type': 'tilt',
                'priority': 'high',
                'title': '建议安装倾角',
                'description': f'当前为平顶，建议采用{int(avg_lat)}°~{int(avg_lat) + 10}°倾角安装，可提升发电量15%~25%'
            })

        if abs(azimuth - 180) > 30:
            recommendations.append({
                'type': 'azimuth',
                'priority': 'medium',
                'title': '朝向优化',
                'description': f'当前朝向{azimuth}°，建议调整为正南向(180°)，可提升发电量约{abs(azimuth - 180) * 0.3:.0f}%'
            })

        if hourly_shadow:
            shadow_hours_count = len([h for h in hourly_shadow if h['sun_elevation'] > 10 and h['shadow_coverage'] > 0.5])
            if shadow_hours_count > 2:
                recommendations.append({
                    'type': 'shadow',
                    'priority': 'high',
                    'title': '阴影遮挡严重',
                    'description': f'日均{shadow_hours_count}小时存在严重阴影遮挡，建议优化板间距或避开阴影区域'
                })

        if total_panels < 10:
            recommendations.append({
                'type': 'layout',
                'priority': 'low',
                'title': '布局优化',
                'description': '屋顶面积较小，建议采用高效组件(>450W)提升装机容量'
            })

        recommendations.append({
            'type': 'general',
            'priority': 'medium',
            'title': '系统设计建议',
            'description': '建议采用组串式逆变器，每15~20块组件一串，设置合理的直流汇流方案'
        })

        return {
            'total_panels': total_panels,
            'total_capacity_kw': total_capacity,
            'panel_specs': {
                'width_m': pv_width,
                'height_m': pv_height,
                'power_kw': pv_power,
                'efficiency': 0.20
            },
            'row_spacing_m': row_spacing,
            'panels': panels,
            'estimated_annual_generation_kwh': total_estimated_kwh,
            'best_sunlight_hours': best_hours,
            'average_shadow_factor': avg_shadow_factor,
            'recommendations': recommendations,
            'layout_pattern': 'landscape' if roof_area < 50 else 'portrait',
            'inverter_recommendation': {
                'type': 'string' if total_capacity < 50 else 'central',
                'count': max(1, int(total_capacity / 50)),
                'power_per_unit_kw': max(50, int(total_capacity / max(1, int(total_capacity / 50))))
            }
        }

    def generate_shadow_heatmap(self, roof_geometry, hourly_shadow, hour=None, grid_size=2):
        """
        生成阴影热力图数据
        """
        geometry_type = roof_geometry.get('type', 'Polygon')
        if geometry_type == 'Polygon':
            coordinates = roof_geometry.get('coordinates', [[]])[0]
        elif geometry_type == 'MultiPolygon':
            coordinates = roof_geometry.get('coordinates', [[[]]])[0][0]
        else:
            coordinates = roof_geometry.get('coordinates', [])

        if len(coordinates) < 3:
            return {'grid': [], 'min_value': 0, 'max_value': 0, 'grid_size': grid_size}

        coords_2d = [(lon, lat) for lon, lat, *_ in coordinates]
        polygon = Polygon(coords_2d)
        bbox = self._get_bounding_box(coords_2d)
        avg_lat = (bbox['min_latitude'] + bbox['max_latitude']) / 2

        lat_step = grid_size / 111320.0
        lon_step = grid_size / (111320.0 * math.cos(math.radians(avg_lat)))

        grid_points = []
        values = []

        lat = bbox['min_latitude']
        while lat <= bbox['max_latitude']:
            lon = bbox['min_longitude']
            while lon <= bbox['max_longitude']:
                point = Point(lon, lat)
                if polygon.contains(point) or polygon.touches(point):
                    if hour is not None:
                        hour_data = next((h for h in hourly_shadow if h['hour'] == hour), None)
                        if hour_data:
                            shadow_value = hour_data['shadow_coverage']
                        else:
                            shadow_value = 0
                    else:
                        peak_hours = [h for h in hourly_shadow if 9 <= h['hour'] <= 15]
                        if peak_hours:
                            shadow_value = sum(h['shadow_coverage'] for h in peak_hours) / len(peak_hours)
                        else:
                            shadow_value = 0

                    z_val = None
                    if any(len(c) >= 3 for c in coordinates):
                        z_val = self._interpolate_height(lon, lat, coordinates)

                    point_data = {
                        'latitude': lat,
                        'longitude': lon,
                        'value': shadow_value,
                        'shadow_coverage': shadow_value,
                        'sunlight_factor': 1 - shadow_value
                    }
                    if z_val is not None:
                        point_data['height'] = z_val

                    grid_points.append(point_data)
                    values.append(shadow_value)

                lon += lon_step
            lat += lat_step

        if not values:
            return {'grid': [], 'min_value': 0, 'max_value': 0, 'grid_size': grid_size}

        return {
            'grid': grid_points,
            'min_value': min(values),
            'max_value': max(values),
            'avg_value': sum(values) / len(values),
            'grid_size': grid_size,
            'point_count': len(grid_points),
            'display_hour': hour,
            'color_scale': [
                {'value': 0, 'color': '#2c7bb6', 'name': '无阴影'},
                {'value': 0.25, 'color': '#92c5de', 'name': '轻微'},
                {'value': 0.5, 'color': '#ffffbf', 'name': '中等'},
                {'value': 0.75, 'color': '#f4a582', 'name': '较重'},
                {'value': 1.0, 'color': '#ca0020', 'name': '严重'}
            ]
        }
