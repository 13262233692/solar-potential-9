import pvlib
import numpy as np
import pandas as pd
from datetime import datetime
from pvlib import location, irradiance, atmosphere


class RadiationCalculator:
    def __init__(self):
        self.module_efficiency = 0.20
        self.system_losses = 0.14
        self.inverter_efficiency = 0.96

    def calculate_annual_radiation(self, latitude, longitude, tilt, azimuth, roof_area, roof_geometry=None, hourly_shadow_factors=None):
        loc = location.Location(latitude, longitude)

        times = pd.date_range(
            start='2023-01-01',
            end='2023-12-31',
            freq='h',
            tz=loc.tz
        )

        solar_position = loc.get_solarposition(times)

        clearsky = loc.get_clearsky(times, model='ineichen')

        pressure = pvlib.atmosphere.alt2pres(10)
        airmass = pvlib.atmosphere.get_relative_airmass(solar_position['apparent_zenith'])
        airmass = pvlib.atmosphere.get_absolute_airmass(airmass, pressure)

        aoi = irradiance.aoi(tilt, azimuth, solar_position['apparent_zenith'], solar_position['azimuth'])

        dni_extra = pvlib.irradiance.get_extra_radiation(times)

        total_irradiance = irradiance.get_total_irradiance(
            surface_tilt=tilt,
            surface_azimuth=azimuth,
            solar_zenith=solar_position['apparent_zenith'],
            solar_azimuth=solar_position['azimuth'],
            dni=clearsky['dni'],
            ghi=clearsky['ghi'],
            dhi=clearsky['dhi'],
            dni_extra=dni_extra,
            airmass=airmass,
            albedo=0.2,
            model='perez'
        )

        poa_irradiance = total_irradiance['poa_global'].copy()

        if hourly_shadow_factors is not None and len(hourly_shadow_factors) > 0:
            shadow_factor_series = pd.Series(1.0, index=times)

            avg_shadow_factor_daylight = 1.0
            valid_daylight_hours = 0
            total_shadow_factor = 0.0

            for h in hourly_shadow_factors:
                if h.get('sun_elevation', 0) > 10:
                    total_shadow_factor += h.get('shadow_factor', 1.0)
                    valid_daylight_hours += 1

            if valid_daylight_hours > 0:
                avg_shadow_factor_daylight = total_shadow_factor / valid_daylight_hours

            for i in range(len(times)):
                sun_elevation = 90 - solar_position['apparent_zenith'].iloc[i]
                if sun_elevation > 0:
                    poa_irradiance.iloc[i] *= avg_shadow_factor_daylight
                    shadow_factor_series.iloc[i] = avg_shadow_factor_daylight

            shadow_loss_pct = (1 - avg_shadow_factor_daylight) * 100
        else:
            shadow_factor_series = pd.Series(1.0, index=times)

        daily_radiation = poa_irradiance.resample('D').sum()
        monthly_radiation = daily_radiation.resample('ME').mean()
        annual_radiation = poa_irradiance.sum()

        shadow_loss_pct = (1 - poa_irradiance.sum() / total_irradiance['poa_global'].sum()) * 100 if total_irradiance['poa_global'].sum() > 0 else 0

        monthly_data = []
        for i, (month, value) in enumerate(monthly_radiation.items()):
            monthly_data.append({
                'month': i + 1,
                'name': month.strftime('%B'),
                'radiation_kwh_m2': float(value) / 1000,
                'radiation_mj_m2': float(value) * 3.6 / 1000
            })
        
        seasonal_radiation = self._calculate_seasonal_radiation(daily_radiation)
        
        simple_sky_dome = self._simple_sky_dome_model(
            latitude, longitude, tilt, azimuth, roof_geometry
        )
        
        annual_radiation_kwh_m2 = float(annual_radiation) / 1000

        result = {
            'annual_radiation': annual_radiation_kwh_m2,
            'annual_radiation_kwh_m2': annual_radiation_kwh_m2,
            'annual_radiation_mj_m2': annual_radiation_kwh_m2 * 3.6,
            'total_energy_kwh': annual_radiation_kwh_m2 * roof_area,
            'monthly_radiation': monthly_data,
            'seasonal_radiation': seasonal_radiation,
            'daily_average_kwh_m2': annual_radiation_kwh_m2 / 365,
            'simple_sky_dome': simple_sky_dome,
            'shadow_loss_percentage': shadow_loss_pct,
            'has_shadow_correction': hourly_shadow_factors is not None and len(hourly_shadow_factors) > 0,
            'parameters': {
                'latitude': latitude,
                'longitude': longitude,
                'tilt': tilt,
                'azimuth': azimuth,
                'roof_area': roof_area
            }
        }

        return result

    def _simple_sky_dome_model(self, latitude, longitude, tilt, azimuth, roof_geometry):
        loc = location.Location(latitude, longitude)
        
        days = pd.date_range(start='2023-01-01', end='2023-12-31', freq='D')
        
        sky_dome_data = []
        for day in days:
            hours = pd.date_range(start=day, periods=24, freq='h', tz=loc.tz)
            solar_pos = loc.get_solarposition(hours)
            
            zenith = solar_pos['apparent_zenith'].values
            azimuth_angle = solar_pos['azimuth'].values
            hour_angle = np.arange(-12, 12, 1)
            
            aoi = irradiance.aoi(tilt, azimuth, zenith, azimuth_angle)
            
            aoi_mask = aoi < 90
            zenith_mask = zenith < 90
            mask = aoi_mask & zenith_mask
            
            if np.any(mask):
                max_elevation = 90 - np.min(zenith[mask])
            else:
                max_elevation = 0
            
            valid_hours = hour_angle[mask] + 12 if len(hour_angle) == len(mask) else np.where(mask)[0]
            
            sky_dome_data.append({
                'day_of_year': day.dayofyear,
                'month': day.month,
                'max_solar_elevation': float(max_elevation),
                'sunrise_hour': float(np.min(valid_hours)) if np.any(mask) else 0,
                'sunset_hour': float(np.max(valid_hours)) if np.any(mask) else 0,
                'daylight_hours': float(np.sum(mask))
            })
        
        annual_avg = {
            'avg_max_elevation': float(np.mean([d['max_solar_elevation'] for d in sky_dome_data])),
            'avg_daylight_hours': float(np.mean([d['daylight_hours'] for d in sky_dome_data])),
            'total_daylight_hours': float(np.sum([d['daylight_hours'] for d in sky_dome_data]))
        }
        
        return {
            'daily_data': sky_dome_data,
            'annual_average': annual_avg,
            'sky_sectors': self._calculate_sky_sectors(latitude, longitude, tilt, azimuth)
        }

    def _calculate_sky_sectors(self, latitude, longitude, tilt, azimuth):
        sectors = []
        sector_count = 8
        sector_width = 45

        loc = location.Location(latitude, longitude)

        for i in range(sector_count):
            sector_azimuth = i * sector_width
            sector_azimuth_end = (i + 1) * sector_width

            days = pd.date_range(start='2023-01-01', end='2023-12-31', freq='D')

            sector_irradiance = 0
            for day in days:
                hours = pd.date_range(start=day, periods=24, freq='h', tz=loc.tz)
                solar_pos = loc.get_solarposition(hours)

                in_sector = (solar_pos['azimuth'] >= sector_azimuth) & \
                            (solar_pos['azimuth'] < sector_azimuth_end) & \
                            (solar_pos['apparent_zenith'] < 90)

                if np.any(in_sector):
                    clearsky = loc.get_clearsky(hours)
                    dni_extra = irradiance.get_extra_radiation(hours)
                    pressure = atmosphere.alt2pres(10)
                    am_rel = atmosphere.get_relative_airmass(solar_pos['apparent_zenith'][in_sector])
                    am_abs = atmosphere.get_absolute_airmass(am_rel, pressure)

                    total_irrad = irradiance.get_total_irradiance(
                        surface_tilt=tilt,
                        surface_azimuth=azimuth,
                        solar_zenith=solar_pos['apparent_zenith'][in_sector],
                        solar_azimuth=solar_pos['azimuth'][in_sector],
                        dni=clearsky['dni'][in_sector],
                        ghi=clearsky['ghi'][in_sector],
                        dhi=clearsky['dhi'][in_sector],
                        dni_extra=dni_extra[in_sector],
                        airmass=am_abs,
                        albedo=0.2,
                        model='perez'
                    )
                    sector_irradiance += total_irrad['poa_global'].sum()

            sectors.append({
                'sector': i + 1,
                'azimuth_start': sector_azimuth,
                'azimuth_end': sector_azimuth_end,
                'direction': self._get_direction_name(sector_azimuth),
                'radiation_kwh_m2': float(sector_irradiance) / 1000,
                'percentage': 0
            })

        total = sum(s['radiation_kwh_m2'] for s in sectors)
        for s in sectors:
            s['percentage'] = (s['radiation_kwh_m2'] / total * 100) if total > 0 else 0

        return sectors

    def _get_direction_name(self, azimuth):
        directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        index = int((azimuth + 22.5) / 45) % 8
        return directions[index]

    def _calculate_seasonal_radiation(self, daily_radiation):
        seasons = {
            'spring': [3, 4, 5],
            'summer': [6, 7, 8],
            'autumn': [9, 10, 11],
            'winter': [12, 1, 2]
        }
        
        seasonal_data = {}
        for season, months in seasons.items():
            mask = daily_radiation.index.month.isin(months)
            seasonal_data[season] = {
                'total_kwh_m2': float(daily_radiation[mask].sum()) / 1000,
                'average_daily_kwh_m2': float(daily_radiation[mask].mean()) / 1000,
                'days': int(mask.sum())
            }
        
        return seasonal_data

    def estimate_pv_potential(self, annual_radiation_kwh_m2, roof_area):
        usable_area = roof_area * 0.8
        
        dc_rating = usable_area * 150
        
        array_rating = dc_rating * 1000
        
        annual_dc = annual_radiation_kwh_m2 * array_rating * self.module_efficiency
        
        annual_ac = annual_dc * self.inverter_efficiency * (1 - self.system_losses)
        
        co2_reduction = annual_ac * 0.785
        
        trees_equivalent = annual_ac / 31.5
        
        return {
            'usable_roof_area': usable_area,
            'dc_rating_kwp': dc_rating,
            'ac_rating_kw': dc_rating * self.inverter_efficiency,
            'annual_dc_kwh': annual_dc,
            'annual_ac_kwh': annual_ac,
            'monthly_ac_kwh': annual_ac / 12,
            'co2_reduction_kg': co2_reduction,
            'co2_reduction_tonnes': co2_reduction / 1000,
            'trees_equivalent': trees_equivalent,
            'economics': {
                'installation_cost': dc_rating * 4500,
                'annual_savings': annual_ac * 0.6,
                'payback_years': (dc_rating * 4500) / (annual_ac * 0.6) if annual_ac > 0 else 0
            }
        }

    def calculate_radiation_for_point(self, latitude, longitude, tilt, azimuth, day_of_year, hour):
        loc = location.Location(latitude, longitude)

        datetime_obj = datetime(2023, 1, 1) + pd.Timedelta(days=day_of_year - 1, hours=hour)
        times = pd.DatetimeIndex([datetime_obj], tz=loc.tz)

        solar_position = loc.get_solarposition(times)
        clearsky = loc.get_clearsky(times, model='ineichen')

        aoi = irradiance.aoi(
            tilt, azimuth,
            solar_position['apparent_zenith'].iloc[0],
            solar_position['azimuth'].iloc[0]
        )

        dni_extra = irradiance.get_extra_radiation(times)
        pressure = atmosphere.alt2pres(10)
        am_rel = atmosphere.get_relative_airmass(solar_position['apparent_zenith'])
        am_abs = atmosphere.get_absolute_airmass(am_rel, pressure)

        total_irradiance = irradiance.get_total_irradiance(
            surface_tilt=tilt,
            surface_azimuth=azimuth,
            solar_zenith=solar_position['apparent_zenith'],
            solar_azimuth=solar_position['azimuth'],
            dni=clearsky['dni'],
            ghi=clearsky['ghi'],
            dhi=clearsky['dhi'],
            dni_extra=dni_extra,
            airmass=am_abs,
            albedo=0.2,
            model='perez'
        )

        return {
            'poa_global': float(total_irradiance['poa_global'].iloc[0]),
            'poa_direct': float(total_irradiance['poa_direct'].iloc[0]),
            'poa_diffuse': float(total_irradiance['poa_diffuse'].iloc[0]),
            'poa_sky_diffuse': float(total_irradiance['poa_sky_diffuse'].iloc[0]),
            'poa_ground_diffuse': float(total_irradiance['poa_ground_diffuse'].iloc[0]),
            'solar_elevation': float(90 - solar_position['apparent_zenith'].iloc[0]),
            'solar_azimuth': float(solar_position['azimuth'].iloc[0]),
            'aoi': float(aoi),
            'dni': float(clearsky['dni'].iloc[0]),
            'ghi': float(clearsky['ghi'].iloc[0]),
            'dhi': float(clearsky['dhi'].iloc[0])
        }
