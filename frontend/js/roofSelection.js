class RoofSelection {
    constructor(cesiumRenderer, options = {}) {
        this.cesiumRenderer = cesiumRenderer;
        this.viewer = cesiumRenderer.getViewer();
        this.scene = cesiumRenderer.getScene();
        
        this.selectedBuilding = null;
        this.hoveredBuilding = null;
        this.isSelecting = false;
        
        this.listeners = {
            onBuildingSelected: options.onBuildingSelected || null,
            onBuildingHovered: options.onBuildingHovered || null,
            onCalculationStart: options.onCalculationStart || null,
            onCalculationComplete: options.onCalculationComplete || null,
            onCalculationError: options.onCalculationError || null
        };
        
        this.handler = null;
        this.loadingIndicator = null;
        
        this.init();
    }

    init() {
        if (!this.viewer) return;
        
        this.createLoadingIndicator();
        
        this.handler = new Cesium.ScreenSpaceEventHandler(this.scene.canvas);
        
        this.setupHoverHandler();
        this.setupClickHandler();
        this.setupRightClickHandler();
        
        this.setupKeyboardShortcuts();
        
        console.log('Roof Selection initialized');
    }

    createLoadingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'calculation-loading';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-family: sans-serif;
            font-size: 16px;
            z-index: 9999;
            display: none;
            align-items: center;
            gap: 15px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;
        indicator.innerHTML = `
            <div style="
                width: 30px;
                height: 30px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #2c7bb6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <span id="loading-text">Calculating solar radiation...</span>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(indicator);
        this.loadingIndicator = indicator;
    }

    showLoading(message = 'Calculating solar radiation...') {
        if (this.loadingIndicator) {
            document.getElementById('loading-text').textContent = message;
            this.loadingIndicator.style.display = 'flex';
        }
    }

    hideLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'none';
        }
    }

    setupHoverHandler() {
        this.handler.setInputAction((movement) => {
            if (!this.viewer || this.isSelecting) return;
            
            const pickedObject = this.viewer.scene.pick(movement.endPosition);
            
            if (pickedObject && pickedObject.id) {
                const entity = pickedObject.id;
                const properties = entity.properties;
                
                if (properties) {
                    const buildingId = properties.buildingId ? properties.buildingId.getValue() : null;
                    const entityType = properties.type ? properties.type.getValue() : null;
                    
                    if (buildingId || (entity.id && entity.id.startsWith('building_'))) {
                        const actualBuildingId = buildingId || entity.id.replace('_roof', '');
                        
                        if (this.hoveredBuilding !== actualBuildingId) {
                            if (this.hoveredBuilding && this.hoveredBuilding !== this.selectedBuilding) {
                                this.cesiumRenderer.unhighlightBuilding(this.hoveredBuilding);
                            }
                            
                            this.hoveredBuilding = actualBuildingId;
                            
                            if (this.hoveredBuilding !== this.selectedBuilding) {
                                this.cesiumRenderer.highlightBuilding(this.hoveredBuilding, Cesium.Color.CYAN);
                            }
                            
                            if (this.listeners.onBuildingHovered) {
                                const buildingData = this.getBuildingData(actualBuildingId);
                                this.listeners.onBuildingHovered(actualBuildingId, buildingData);
                            }
                        }
                        
                        this.scene.canvas.style.cursor = 'pointer';
                        return;
                    }
                }
            }
            
            if (this.hoveredBuilding && this.hoveredBuilding !== this.selectedBuilding) {
                this.cesiumRenderer.unhighlightBuilding(this.hoveredBuilding);
                this.hoveredBuilding = null;
                
                if (this.listeners.onBuildingHovered) {
                    this.listeners.onBuildingHovered(null, null);
                }
            }
            
            this.scene.canvas.style.cursor = 'default';
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    }

    setupClickHandler() {
        this.handler.setInputAction((movement) => {
            if (!this.viewer || this.isSelecting) return;
            
            const pickedObject = this.viewer.scene.pick(movement.position);
            
            if (pickedObject && pickedObject.id) {
                const entity = pickedObject.id;
                const properties = entity.properties;
                
                if (properties) {
                    const buildingId = properties.buildingId ? properties.buildingId.getValue() : null;
                    
                    if (buildingId || (entity.id && entity.id.startsWith('building_'))) {
                        const actualBuildingId = buildingId || entity.id.replace('_roof', '');
                        this.selectBuilding(actualBuildingId);
                    }
                } else if (entity.id && entity.id.startsWith('building_')) {
                    this.selectBuilding(entity.id);
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    setupRightClickHandler() {
        this.handler.setInputAction((movement) => {
            if (this.selectedBuilding) {
                this.clearSelection();
            }
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSelection();
            }
            
            if (e.key === 'Enter' && this.selectedBuilding && !e.ctrlKey && !e.shiftKey) {
                this.calculateForSelectedBuilding();
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && this.selectedBuilding) {
                this.calculateForSelectedBuilding();
            }
        });
    }

    getBuildingData(buildingId) {
        const entity = this.cesiumRenderer.buildingEntities[buildingId];
        if (entity && entity.properties) {
            return entity.properties.getValue(Cesium.JulianDate.now());
        }
        return null;
    }

    async selectBuilding(buildingId) {
        if (this.isSelecting) return;
        
        if (this.selectedBuilding && this.selectedBuilding !== buildingId) {
            this.cesiumRenderer.unhighlightBuilding(this.selectedBuilding);
            this.cesiumRenderer.clearHeatmap();
        }
        
        this.selectedBuilding = buildingId;
        this.cesiumRenderer.highlightBuilding(buildingId, Cesium.Color.LIME);
        
        const buildingData = this.getBuildingData(buildingId);
        
        if (this.listeners.onBuildingSelected) {
            this.listeners.onBuildingSelected(buildingId, buildingData);
        }
        
        this.cesiumRenderer.flyToBuilding(buildingId);
    }

    async calculateForSelectedBuilding() {
        if (!this.selectedBuilding || this.isSelecting) return;

        this.isSelecting = true;
        this.showLoading('Calculating solar radiation, shadow analysis and PV layout...');

        if (this.listeners.onCalculationStart) {
            this.listeners.onCalculationStart(this.selectedBuilding);
        }

        try {
            const buildingData = this.getBuildingData(this.selectedBuilding);

            if (!buildingData) {
                throw new Error('Building data not found');
            }

            const enableShadow = document.getElementById('enable-shadow-calc')?.checked ?? true;
            const dayOfYear = parseInt(document.getElementById('shadow-day-of-year')?.value ?? 172);

            const params = {
                building_id: this.selectedBuilding,
                latitude: buildingData.location?.latitude || 31.2304,
                longitude: buildingData.location?.longitude || 121.4737,
                roof_geometry: buildingData.roof_geometry,
                tilt: buildingData.roof_tilt || 0,
                azimuth: buildingData.roof_azimuth || 180,
                enable_shadow: enableShadow,
                day_of_year: dayOfYear
            };

            const result = await apiClient.calculateRadiation(params);

            const effectiveTilt = result.roof_properties?.tilt || buildingData.roof_tilt || 0;
            const effectiveAzimuth = result.roof_properties?.azimuth || buildingData.roof_azimuth || 180;

            this.cesiumRenderer.addHeatmapGrid(result.heatmap, buildingData.height || 15);

            if (result.shadow_heatmap) {
                this.cesiumRenderer.addShadowHeatmapGrid(result.shadow_heatmap, buildingData.height || 15);
            }

            if (result.pv_layout) {
                this.cesiumRenderer.addPVLayout(result.pv_layout, buildingData.height || 15);
            }

            if (this.listeners.onCalculationComplete) {
                this.listeners.onCalculationComplete(this.selectedBuilding, result);
            }

        } catch (error) {
            console.error('Calculation error:', error);

            if (this.listeners.onCalculationError) {
                this.listeners.onCalculationError(this.selectedBuilding, error);
            }

            this.showNotification('Error calculating radiation. Please try again.', 'error');

        } finally {
            this.isSelecting = false;
            this.hideLoading();
        }
    }

    clearSelection() {
        if (this.selectedBuilding) {
            this.cesiumRenderer.unhighlightBuilding(this.selectedBuilding);
            this.cesiumRenderer.clearAllOverlays();
            this.selectedBuilding = null;
        }

        if (this.hoveredBuilding) {
            this.cesiumRenderer.unhighlightBuilding(this.hoveredBuilding);
            this.hoveredBuilding = null;
        }

        if (this.listeners.onBuildingSelected) {
            this.listeners.onBuildingSelected(null, null);
        }
    }

    showNotification(message, type = 'info') {
        const colors = {
            info: '#2c7bb6',
            success: '#00a65a',
            warning: '#f39c12',
            error: '#d73925'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        notification.innerHTML += `
            <style>
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            </style>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    selectBuildingById(buildingId) {
        return this.selectBuilding(buildingId);
    }

    getSelectedBuilding() {
        return this.selectedBuilding;
    }

    getSelectedBuildingData() {
        if (this.selectedBuilding) {
            return this.getBuildingData(this.selectedBuilding);
        }
        return null;
    }

    on(event, callback) {
        if (this.listeners.hasOwnProperty(event)) {
            this.listeners[event] = callback;
        }
    }

    destroy() {
        if (this.handler) {
            this.handler.destroy();
            this.handler = null;
        }
        
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
        
        this.clearSelection();
        this.cesiumRenderer = null;
        this.viewer = null;
        this.scene = null;
    }
}

window.RoofSelection = RoofSelection;
