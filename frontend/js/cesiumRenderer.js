class CesiumRenderer {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.viewer = null;
        this.tileset = null;
        this.buildingEntities = {};
        this.heatmapEntities = [];
        this.shadowHeatmapEntities = [];
        this.pvLayoutEntities = [];
        this.selectedBuilding = null;
        this.highlightEntity = null;
        
        this.defaultOptions = {
            cesiumIonAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4NTMxZTBmYS03YjYxLTQ0ZDctOWY0MC1kMzQwYjM0Njk3OTIiLCJpZCI6MjU5LCJpYXQiOjE3MjE5ODk3NzR9.3rG4fV5d7XqgJ5e4fR5bQeQ5d7XqgJ5e4fR5bQeQ5d7',
            center: [121.4737, 31.2304, 500],
            terrainProvider: null,
            show3DBuildings: true,
            showImagery: true
        };
        
        this.options = { ...this.defaultOptions, ...options };
        
        this.init();
    }

    init() {
        if (typeof Cesium === 'undefined') {
            console.error('Cesium is not loaded. Please include Cesium.js first.');
            return;
        }

        Cesium.Ion.defaultAccessToken = this.options.cesiumIonAccessToken;

        try {
            let terrainProvider = this.options.terrainProvider;
            if (!terrainProvider) {
                if (typeof Cesium.Terrain !== 'undefined' && typeof Cesium.Terrain.fromWorldTerrain === 'function') {
                    terrainProvider = Cesium.Terrain.fromWorldTerrain();
                } else if (typeof Cesium.createWorldTerrain === 'function') {
                    terrainProvider = Cesium.createWorldTerrain();
                } else {
                    terrainProvider = new Cesium.EllipsoidTerrainProvider();
                }
            }

            this.viewer = new Cesium.Viewer(this.containerId, {
                terrainProvider: terrainProvider,
                animation: true,
                timeline: true,
                geocoder: true,
                homeButton: true,
                sceneModePicker: true,
                baseLayerPicker: true,
                navigationHelpButton: true,
                fullscreenButton: true,
                infoBox: true,
                selectionIndicator: true
            });

            this.viewer.scene.globe.enableLighting = true;
            this.viewer.scene.fog.enabled = true;
            this.viewer.scene.skyAtmosphere.show = true;

            this.flyTo(this.options.center[0], this.options.center[1], this.options.center[2]);

            console.log('Cesium Viewer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Cesium Viewer:', error);
        }
    }

    flyTo(longitude, latitude, height = 500, heading = 0, pitch = -45) {
        if (!this.viewer) return;

        this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
                longitude,
                latitude,
                height
            ),
            orientation: {
                heading: Cesium.Math.toRadians(heading),
                pitch: Cesium.Math.toRadians(pitch),
                roll: 0.0
            },
            duration: 2
        });
    }

    load3DTiles(url, options = {}) {
        if (!this.viewer) return null;

        const defaultOptions = {
            url: url,
            show: true,
            skipLevelOfDetail: true,
            baseScreenSpaceError: 1024,
            dynamicScreenSpaceError: true,
            dynamicScreenSpaceErrorDensity: 0.005,
            dynamicScreenSpaceErrorFactor: 12.0,
            dynamicScreenSpaceErrorHeightFalloff: 0.25,
            style: new Cesium.Cesium3DTileStyle({
                color: {
                    conditions: [
                        ['${feature["cesium#color"]} !== undefined', 'color("${feature["cesium#color"]}")'],
                        ['true', 'color("white", 0.8)']
                    ]
                }
            })
        };

        const tilesetOptions = { ...defaultOptions, ...options };

        return new Promise((resolve, reject) => {
            Cesium.Cesium3DTileset.fromUrl(url, tilesetOptions)
                .then((tileset) => {
                    this.tileset = tileset;
                    this.viewer.scene.primitives.add(tileset);

                    tileset.tileVisible.addEventListener((tile) => {
                        const content = tile.content;
                        const featuresLength = content.featuresLength;
                        for (let i = 0; i < featuresLength; i++) {
                            const feature = content.getFeature(i);
                            if (feature) {
                                feature.getPropertyNames().forEach((name) => {
                                    if (!feature.hasProperty(name)) {
                                        try {
                                            feature.addProperty(name, feature.getProperty(name));
                                        } catch (e) {}
                                    }
                                });
                            }
                        }
                    });

                    this.viewer.zoomTo(tileset);
                    resolve(tileset);
                })
                .catch((error) => {
                    console.error('Failed to load 3D Tiles:', error);
                    reject(error);
                });
        });
    }

    addBuildingEntity(buildingData) {
        if (!this.viewer || !buildingData) return null;

        const { id, name, roof_geometry, location, height = 15, color = Cesium.Color.YELLOW } = buildingData;

        if (!roof_geometry || !roof_geometry.coordinates) {
            console.warn('No roof geometry provided for building:', id);
            return null;
        }

        const coordinates = roof_geometry.coordinates[0];
        const hierarchy = [];

        for (const coord of coordinates) {
            hierarchy.push(Cesium.Cartesian3.fromDegrees(coord[0], coord[1], height));
        }

        const entity = this.viewer.entities.add({
            id: id,
            name: name,
            description: this.createBuildingDescription(buildingData),
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(hierarchy),
                height: height,
                extrudedHeight: height,
                material: color.withAlpha(0.6),
                outline: true,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2.0
            },
            position: Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, height / 2),
            properties: buildingData
        });

        this.buildingEntities[id] = entity;
        return entity;
    }

    addBuildingRoofPolygon(buildingData, options = {}) {
        if (!this.viewer || !buildingData) return null;

        const { id, roof_geometry, height = 15 } = buildingData;
        
        if (!roof_geometry || !roof_geometry.coordinates) {
            return null;
        }

        const coordinates = roof_geometry.coordinates[0];
        const hierarchy = [];

        for (const coord of coordinates) {
            hierarchy.push(Cesium.Cartesian3.fromDegrees(coord[0], coord[1], height + 0.5));
        }

        const entity = this.viewer.entities.add({
            id: `${id}_roof`,
            name: `${buildingData.name || id} - Roof`,
            polygon: {
                hierarchy: new Cesium.PolygonHierarchy(hierarchy),
                material: options.color || Cesium.Color.RED.withAlpha(0.8),
                outline: true,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3.0,
                perPositionHeight: true
            },
            properties: {
                buildingId: id,
                type: 'roof',
                ...buildingData
            }
        });

        return entity;
    }

    createBuildingDescription(buildingData) {
        return `
            <div style="font-family: sans-serif; padding: 10px; min-width: 200px;">
                <h4 style="margin: 0 0 10px 0; color: #2c7bb6;">${buildingData.name || 'Building'}</h4>
                <p style="margin: 5px 0;"><strong>Address:</strong> ${buildingData.address || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Type:</strong> ${buildingData.type || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Height:</strong> ${buildingData.height || 0}m</p>
                <p style="margin: 5px 0;"><strong>Floors:</strong> ${buildingData.floors || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Roof Type:</strong> ${buildingData.roof_type || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Roof Tilt:</strong> ${buildingData.roof_tilt || 0}°</p>
                ${buildingData.last_analysis ? `
                    <hr style="margin: 10px 0;">
                    <p style="margin: 5px 0;"><strong>Annual Radiation:</strong> ${buildingData.last_analysis.radiation?.annual_radiation_kwh_m2?.toFixed(2) || 'N/A'} kWh/m²</p>
                    <p style="margin: 5px 0;"><strong>PV Potential:</strong> ${buildingData.last_analysis.pv_potential?.annual_ac_kwh?.toFixed(0) || 'N/A'} kWh/year</p>
                ` : ''}
            </div>
        `;
    }

    highlightBuilding(buildingId, color = Cesium.Color.YELLOW) {
        const entity = this.buildingEntities[buildingId];
        if (entity && entity.polygon) {
            entity.polygon.material = color.withAlpha(0.8);
        }

        const roofEntity = this.viewer.entities.getById(`${buildingId}_roof`);
        if (roofEntity && roofEntity.polygon) {
            roofEntity.polygon.material = color.withAlpha(0.9);
        }

        this.selectedBuilding = buildingId;
    }

    unhighlightBuilding(buildingId) {
        const entity = this.buildingEntities[buildingId];
        if (entity && entity.polygon) {
            entity.polygon.material = Cesium.Color.YELLOW.withAlpha(0.6);
        }

        const roofEntity = this.viewer.entities.getById(`${buildingId}_roof`);
        if (roofEntity && roofEntity.polygon) {
            roofEntity.polygon.material = Cesium.Color.RED.withAlpha(0.8);
        }

        if (this.selectedBuilding === buildingId) {
            this.selectedBuilding = null;
        }
    }

    clearHeatmap() {
        for (const entity of this.heatmapEntities) {
            this.viewer.entities.remove(entity);
        }
        this.heatmapEntities = [];
    }

    addHeatmapPoint(point, options = {}) {
        if (!this.viewer || !point) return null;

        const { latitude, longitude, value, value_kwh_m2 } = point;
        const height = options.height || 20;
        const size = options.size || 2;

        const color = this.getHeatmapColor(value, options.minValue, options.maxValue);

        const entity = this.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 0.1),
            ellipse: {
                semiMinorAxis: size,
                semiMajorAxis: size,
                material: color,
                height: height + 0.1,
                outline: false
            },
            properties: {
                type: 'heatmap',
                value: value,
                value_kwh_m2: value_kwh_m2
            }
        });

        this.heatmapEntities.push(entity);
        return entity;
    }

    addHeatmapGrid(heatmapData, buildingHeight = 15) {
        this.clearHeatmap();

        if (!heatmapData || !heatmapData.grid) return;

        const { grid, min_value, max_value, tilt, azimuth } = heatmapData;
        const gridSize = heatmapData.grid_size || 2;

        for (const point of grid) {
            const pointHeight = point.height != null ? point.height : buildingHeight;
            this.addHeatmapPoint(point, {
                height: pointHeight,
                size: gridSize * 0.9,
                minValue: min_value,
                maxValue: max_value
            });
        }

        return this.heatmapEntities;
    }

    getHeatmapColor(value, minValue, maxValue) {
        if (minValue === maxValue) {
            return Cesium.Color.YELLOW.withAlpha(0.7);
        }

        const normalized = (value - minValue) / (maxValue - minValue);

        const colors = [
            { pos: 0.0, r: 0.17, g: 0.48, b: 0.71 },
            { pos: 0.25, r: 0.0, g: 0.65, b: 0.79 },
            { pos: 0.5, r: 1.0, g: 1.0, b: 0.75 },
            { pos: 0.75, r: 0.99, g: 0.68, b: 0.38 },
            { pos: 1.0, r: 0.84, g: 0.10, b: 0.11 }
        ];

        for (let i = 0; i < colors.length - 1; i++) {
            if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {
                const range = colors[i + 1].pos - colors[i].pos;
                const factor = (normalized - colors[i].pos) / range;
                
                const r = colors[i].r + factor * (colors[i + 1].r - colors[i].r);
                const g = colors[i].g + factor * (colors[i + 1].g - colors[i].g);
                const b = colors[i].b + factor * (colors[i + 1].b - colors[i].b);
                
                return new Cesium.Color(r, g, b, 0.8);
            }
        }

        return Cesium.Color.RED.withAlpha(0.8);
    }

    loadBuildings(buildingsData) {
        if (!buildingsData || !Array.isArray(buildingsData)) return;

        for (const building of buildingsData) {
            this.addBuildingEntity(building);
            this.addBuildingRoofPolygon(building);
        }
    }

    removeBuilding(buildingId) {
        if (this.buildingEntities[buildingId]) {
            this.viewer.entities.remove(this.buildingEntities[buildingId]);
            delete this.buildingEntities[buildingId];
        }

        const roofEntity = this.viewer.entities.getById(`${buildingId}_roof`);
        if (roofEntity) {
            this.viewer.entities.remove(roofEntity);
        }
    }

    clearAllBuildings() {
        for (const buildingId in this.buildingEntities) {
            this.removeBuilding(buildingId);
        }
        this.buildingEntities = {};
    }

    set3DBuildingsVisibility(visible) {
        if (this.tileset) {
            this.tileset.show = visible;
        }
    }

    addShadowHeatmapGrid(shadowHeatmapData, buildingHeight = 15) {
        this.clearShadowHeatmap();

        if (!shadowHeatmapData || !shadowHeatmapData.grid) return;

        const { grid, min_value, max_value } = shadowHeatmapData;
        const gridSize = shadowHeatmapData.grid_size || 2;

        for (const point of grid) {
            const pointHeight = point.height != null ? point.height : buildingHeight;
            const shadowValue = point.value;

            const color = this.getShadowColor(shadowValue, min_value, max_value);

            const position = Cesium.Cartesian3.fromDegrees(
                point.longitude,
                point.latitude,
                pointHeight + 0.1
            );

            const halfSize = gridSize * 0.45;

            const pointEntity = this.viewer.entities.add({
                position: position,
                name: `shadow_point_${point.latitude}_${point.longitude}`,
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray([
                        point.longitude - halfSize / 111320, point.latitude,
                        point.longitude, point.latitude - halfSize / (111320 * 0.866),
                        point.longitude + halfSize / 111320, point.latitude,
                        point.longitude, point.latitude + halfSize / (111320 * 0.866)
                    ]),
                    height: pointHeight + 0.1,
                    material: color,
                    outline: false,
                    perPositionHeight: false
                }
            });

            this.shadowHeatmapEntities.push(pointEntity);
        }

        return this.shadowHeatmapEntities;
    }

    clearShadowHeatmap() {
        if (this.shadowHeatmapEntities && this.shadowHeatmapEntities.length > 0) {
            for (const entity of this.shadowHeatmapEntities) {
                this.viewer.entities.remove(entity);
            }
        }
        this.shadowHeatmapEntities = [];
    }

    getShadowColor(value, minValue, maxValue) {
        const normalized = maxValue > minValue ? (value - minValue) / (maxValue - minValue) : 0.5;

        const colors = [
            { pos: 0.0, r: 0.17, g: 0.48, b: 0.71, a: 0.7 },
            { pos: 0.25, r: 0.57, g: 0.77, b: 0.87, a: 0.7 },
            { pos: 0.5, r: 1.0, g: 1.0, b: 0.75, a: 0.7 },
            { pos: 0.75, r: 0.96, g: 0.65, b: 0.51, a: 0.7 },
            { pos: 1.0, r: 0.79, g: 0.0, b: 0.13, a: 0.7 }
        ];

        for (let i = 0; i < colors.length - 1; i++) {
            if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {
                const range = colors[i + 1].pos - colors[i].pos;
                const factor = (normalized - colors[i].pos) / range;

                const r = colors[i].r + factor * (colors[i + 1].r - colors[i].r);
                const g = colors[i].g + factor * (colors[i + 1].g - colors[i].g);
                const b = colors[i].b + factor * (colors[i + 1].b - colors[i].b);
                const a = colors[i].a + factor * (colors[i + 1].a - colors[i].a);

                return new Cesium.Color(r, g, b, a);
            }
        }

        return new Cesium.Color(0.79, 0.0, 0.13, 0.7);
    }

    addPVLayout(pvLayoutData, buildingHeight = 15) {
        this.clearPVLayout();

        if (!pvLayoutData || !pvLayoutData.panels) return;

        const { panels, total_panels, total_capacity_kw } = pvLayoutData;

        for (const panel of panels) {
            const corners = panel.corners;
            if (!corners || corners.length < 4) continue;

            const positions = [];
            for (const corner of corners.slice(0, 4)) {
                positions.push(corner[0]);
                positions.push(corner[1]);
                positions.push(buildingHeight + 0.3);
            }

            const panelEntity = this.viewer.entities.add({
                name: `pv_panel_${panel.panel_id}`,
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
                    material: Cesium.Color.BLUE.withAlpha(0.6),
                    outline: true,
                    outlineColor: Cesium.Color.DARKBLUE,
                    outlineWidth: 2,
                    perPositionHeight: false
                },
                properties: {
                    panelId: panel.panel_id,
                    powerKw: panel.power_kw,
                    efficiency: panel.efficiency,
                    estimatedAnnualKwh: panel.estimated_annual_kwh
                }
            });

            this.pvLayoutEntities.push(panelEntity);
        }

        return this.pvLayoutEntities;
    }

    clearPVLayout() {
        if (this.pvLayoutEntities && this.pvLayoutEntities.length > 0) {
            for (const entity of this.pvLayoutEntities) {
                this.viewer.entities.remove(entity);
            }
        }
        this.pvLayoutEntities = [];
    }

    clearAllOverlays() {
        this.clearHeatmap();
        this.clearShadowHeatmap();
        this.clearPVLayout();
        this.clearHighlight();
    }

    setBuildingsVisibility(visible) {
        for (const buildingId in this.buildingEntities) {
            const entity = this.buildingEntities[buildingId];
            if (entity) {
                entity.show = visible;
            }

            const roofEntity = this.viewer.entities.getById(`${buildingId}_roof`);
            if (roofEntity) {
                roofEntity.show = visible;
            }
        }
    }

    setHeatmapVisibility(visible) {
        for (const entity of this.heatmapEntities) {
            entity.show = visible;
        }
    }

    zoomToBuilding(buildingId) {
        const entity = this.buildingEntities[buildingId];
        if (entity) {
            this.viewer.zoomTo(entity);
        }
    }

    flyToBuilding(buildingId) {
        const entity = this.buildingEntities[buildingId];
        if (entity && entity.position) {
            const cartographic = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()));
            
            this.flyTo(
                Cesium.Math.toDegrees(cartographic.longitude),
                Cesium.Math.toDegrees(cartographic.latitude),
                Math.max(cartographic.height * 3, 100),
                0,
                -45
            );
        }
    }

    getViewer() {
        return this.viewer;
    }

    getScene() {
        return this.viewer ? this.viewer.scene : null;
    }

    destroy() {
        if (this.viewer) {
            this.viewer.destroy();
            this.viewer = null;
        }
        this.buildingEntities = {};
        this.heatmapEntities = [];
        this.tileset = null;
    }
}

window.CesiumRenderer = CesiumRenderer;
