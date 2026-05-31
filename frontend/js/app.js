class SolarPotentialApp {
    constructor() {
        this.cesiumRenderer = null;
        this.roofSelection = null;
        this.heatmapGenerator = null;
        
        this.buildings = [];
        this.selectedBuildingId = null;
        this.currentAnalysisResult = null;
        
        this.init();
    }

    async init() {
        console.log('Initializing Solar Potential Assessment App...');
        
        this.heatmapGenerator = new HeatmapGenerator({
            colormap: 'jet',
            opacity: 0.85
        });
        
        try {
            await this.initCesium();
            await this.checkApiConnection();
            await this.loadBuildings();
            this.setupEventListeners();
            this.updateStats();
            
            console.log('App initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showNotification('应用初始化失败，请检查网络连接', 'error');
        }
    }

    async initCesium() {
        return new Promise((resolve, reject) => {
            const checkCesium = () => {
                if (typeof Cesium !== 'undefined') {
                    this.cesiumRenderer = new CesiumRenderer('cesium-container', {
                        center: [121.4737, 31.2304, 800],
                        show3DBuildings: true
                    });
                    
                    this.roofSelection = new RoofSelection(this.cesiumRenderer, {
                        onBuildingSelected: (buildingId, buildingData) => {
                            this.onBuildingSelected(buildingId, buildingData);
                        },
                        onBuildingHovered: (buildingId, buildingData) => {
                            this.onBuildingHovered(buildingId, buildingData);
                        },
                        onCalculationStart: (buildingId) => {
                            this.onCalculationStart(buildingId);
                        },
                        onCalculationComplete: (buildingId, result) => {
                            this.onCalculationComplete(buildingId, result);
                        },
                        onCalculationError: (buildingId, error) => {
                            this.onCalculationError(buildingId, error);
                        }
                    });
                    
                    resolve();
                } else {
                    setTimeout(checkCesium, 100);
                }
            };
            
            setTimeout(checkCesium, 100);
            
            setTimeout(() => {
                if (!this.cesiumRenderer) {
                    reject(new Error('Cesium failed to load'));
                }
            }, 10000);
        });
    }

    async checkApiConnection() {
        const apiStatus = document.getElementById('api-status');
        apiStatus.textContent = 'API: 连接中...';
        apiStatus.className = 'status-indicator status-loading';
        
        try {
            const result = await apiClient.healthCheck();
            apiStatus.textContent = 'API: 已连接';
            apiStatus.className = 'status-indicator status-connected';
            return true;
        } catch (error) {
            apiStatus.textContent = 'API: 未连接';
            apiStatus.className = 'status-indicator status-disconnected';
            return false;
        }
    }

    async loadBuildings() {
        try {
            const result = await apiClient.getBuildings();
            this.buildings = result.buildings || [];
            
            if (this.cesiumRenderer) {
                this.cesiumRenderer.loadBuildings(this.buildings);
            }
            
            this.renderBuildingList();
            this.updateStats();
            
            return this.buildings;
        } catch (error) {
            console.error('Failed to load buildings:', error);
            this.showNotification('加载建筑数据失败', 'error');
            return [];
        }
    }

    renderBuildingList() {
        const container = document.getElementById('building-list');
        
        if (!this.buildings || this.buildings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 21h18"/>
                        <path d="M5 21V7l8-4v18"/>
                        <path d="M19 21V11l-6-4"/>
                    </svg>
                    <p>暂无建筑数据</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.buildings.map(building => `
            <div class="building-item ${this.selectedBuildingId === building.id ? 'selected' : ''}" 
                 data-building-id="${building.id}">
                <div class="building-name">${building.name || building.id}</div>
                <div class="building-address">${building.address || '未知地址'}</div>
                <div class="building-stats">
                    <span>高度: ${building.height || 0}m</span>
                    <span>层数: ${building.floors || '-'}</span>
                </div>
                ${building.last_analysis ? '<span class="analyzed-badge">✓ 已分析</span>' : ''}
            </div>
        `).join('');
        
        container.querySelectorAll('.building-item').forEach(item => {
            item.addEventListener('click', () => {
                const buildingId = item.dataset.buildingId;
                this.selectBuilding(buildingId);
            });
        });
    }

    selectBuilding(buildingId) {
        if (this.roofSelection) {
            this.roofSelection.selectBuildingById(buildingId);
        }
    }

    onBuildingSelected(buildingId, buildingData) {
        this.selectedBuildingId = buildingId;
        
        const calculateBtn = document.getElementById('btn-calculate');
        const clearBtn = document.getElementById('btn-clear');
        
        if (buildingId && buildingData) {
            calculateBtn.disabled = false;
            clearBtn.disabled = false;
            this.showBuildingInfo(buildingData);
            this.renderBuildingList();
            
            if (buildingData.last_analysis) {
                this.showAnalysisResults(buildingData.last_analysis);
            } else {
                this.hideAnalysisResults();
            }
        } else {
            calculateBtn.disabled = true;
            clearBtn.disabled = true;
            this.hideBuildingInfo();
            this.hideAnalysisResults();
            this.renderBuildingList();
        }
    }

    onBuildingHovered(buildingId, buildingData) {
    }

    onCalculationStart(buildingId) {
        const calculateBtn = document.getElementById('btn-calculate');
        calculateBtn.disabled = true;
        calculateBtn.innerHTML = `
            <div style="
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top: 2px solid white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            计算中...
        `;
    }

    onCalculationComplete(buildingId, result) {
        this.currentAnalysisResult = result;
        
        const building = this.buildings.find(b => b.id === buildingId);
        if (building) {
            building.last_analysis = result;
        }
        
        const calculateBtn = document.getElementById('btn-calculate');
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            重新计算
        `;
        
        this.showAnalysisResults(result);
        this.renderBuildingList();
        this.updateStats();
        
        if (this.heatmapGenerator) {
            const legend = this.heatmapGenerator.createInteractiveLegend(result.heatmap);
            const existingLegend = document.querySelector('.heatmap-legend');
            if (existingLegend) {
                existingLegend.remove();
            }
            document.getElementById('map-container').appendChild(legend);
        }
        
        this.showNotification('太阳辐射计算完成！', 'success');
    }

    onCalculationError(buildingId, error) {
        const calculateBtn = document.getElementById('btn-calculate');
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            计算太阳辐射
        `;
        
        this.showNotification('计算失败，请稍后重试', 'error');
    }

    showBuildingInfo(buildingData) {
        const infoSection = document.getElementById('building-info');
        const detailsContainer = document.getElementById('building-details');
        
        infoSection.style.display = 'block';
        
        const roofTypeNames = {
            'flat': '平顶',
            'gable': '双坡顶',
            'hip': '四坡顶',
            'shed': '单坡顶',
            'gambrel': '复斜屋顶'
        };
        
        const typeNames = {
            'commercial': '商业建筑',
            'residential': '住宅建筑',
            'industrial': '工业建筑',
            'public': '公共建筑',
            'mixed': '混合用途'
        };
        
        detailsContainer.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">建筑ID</span>
                <span class="detail-value">${buildingData.id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">建筑类型</span>
                <span class="detail-value">${typeNames[buildingData.type] || buildingData.type || '未知'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">建造年份</span>
                <span class="detail-value">${buildingData.construction_year || '未知'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">建筑高度</span>
                <span class="detail-value">${buildingData.height || 0} m</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">楼层数</span>
                <span class="detail-value">${buildingData.floors || '未知'} 层</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">屋顶类型</span>
                <span class="detail-value">${roofTypeNames[buildingData.roof_type] || buildingData.roof_type || '未知'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">屋顶倾角</span>
                <span class="detail-value">${buildingData.roof_tilt || 0}°</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">屋顶朝向</span>
                <span class="detail-value">${buildingData.roof_azimuth || 180}° (${this.getOrientationName(buildingData.roof_azimuth || 180)})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">经纬度</span>
                <span class="detail-value">${buildingData.location?.latitude?.toFixed(4) || '-'}°N, ${buildingData.location?.longitude?.toFixed(4) || '-'}°E</span>
            </div>
        `;
    }

    hideBuildingInfo() {
        const infoSection = document.getElementById('building-info');
        infoSection.style.display = 'none';
    }

    showAnalysisResults(result) {
        const resultsSection = document.getElementById('analysis-results');
        const detailsContainer = document.getElementById('analysis-details');

        resultsSection.style.display = 'block';

        const radiation = result.radiation;
        const pvPotential = result.pv_potential;
        const roofProps = result.roof_properties;
        const pvLayout = result.pv_layout;
        const hourlyShadow = result.hourly_shadow;

        const monthlyChart = this.createMonthlyChart(radiation.monthly_radiation);
        const seasonGrid = this.createSeasonGrid(radiation.seasonal_radiation);
        const shadowSummary = this.createShadowSummary(hourlyShadow);
        const hourlyShadowChart = this.createHourlyShadowChart(hourlyShadow);
        const pvLayoutSummary = this.createPVLayoutSummary(pvLayout);
        const recommendations = this.createRecommendations(pvLayout);

        detailsContainer.innerHTML = `
            <div class="result-section">
                <h3>☀️ 年太阳辐射量</h3>
                <div class="result-value">
                    <span class="main-value">${radiation.annual_radiation_kwh_m2?.toFixed(1) || '-'}</span>
                    <span class="unit">kWh/m² / 年</span>
                </div>
                ${radiation.shadow_loss_percentage > 0.1 ? `
                <div class="shadow-loss-indicator">
                    <span>🌑 阴影损失: ${radiation.shadow_loss_percentage?.toFixed(1)}%</span>
                </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">日均辐射</span>
                    <span class="detail-value">${radiation.daily_average_kwh_m2?.toFixed(2) || '-'} kWh/m²</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">总辐射能量</span>
                    <span class="detail-value">${(radiation.total_energy_kwh / 1000)?.toFixed(1) || '-'} MWh</span>
                </div>
            </div>

            ${shadowSummary}
            ${hourlyShadowChart}

            <div class="result-section">
                <h3>📊 月度分布</h3>
                ${monthlyChart}
                <div style="margin-top: 20px;"></div>
            </div>

            <div class="result-section">
                <h3>🌤️ 季节分布</h3>
                ${seasonGrid}
            </div>

            <div class="result-section">
                <h3>🏠 屋顶信息</h3>
                <div class="detail-row">
                    <span class="detail-label">屋顶面积</span>
                    <span class="detail-value">${roofProps.area?.toFixed(1) || '-'} m²</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">可用面积</span>
                    <span class="detail-value">${roofProps.usable_area?.toFixed(1) || '-'} m²</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">屋顶倾角</span>
                    <span class="detail-value">${roofProps.tilt || '-'}°</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">屋顶朝向</span>
                    <span class="detail-value">${roofProps.orientation || '-'}</span>
                </div>
            </div>

            ${pvLayoutSummary}
            ${recommendations}

            <div class="result-section">
                <h3>⚡ 光伏发电潜力</h3>
                <div class="result-value">
                    <span class="main-value">${(pvPotential.annual_ac_kwh / 1000)?.toFixed(1) || '-'}</span>
                    <span class="unit">MWh / 年</span>
                </div>
                <div class="potential-meter">
                    <div class="potential-fill" style="width: ${Math.min(100, (pvPotential.annual_ac_kwh / 50000) * 100)}%;"></div>
                </div>
                <div class="detail-row" style="margin-top: 12px;">
                    <span class="detail-label">系统容量</span>
                    <span class="detail-value">${pvPotential.dc_rating_kwp?.toFixed(1) || '-'} kWp</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">月均发电量</span>
                    <span class="detail-value">${(pvPotential.monthly_ac_kwh / 1000)?.toFixed(2) || '-'} MWh</span>
                </div>
            </div>

            <div class="result-section">
                <h3>🌱 环保效益</h3>
                <div class="eco-stats">
                    <div class="eco-stat">
                        <div class="eco-icon">💨</div>
                        <div class="eco-value">${pvPotential.co2_reduction_tonnes?.toFixed(1) || '-'}</div>
                        <div class="eco-label">CO₂减排 (吨/年)</div>
                    </div>
                    <div class="eco-stat">
                        <div class="eco-icon">🌳</div>
                        <div class="eco-value">${pvPotential.trees_equivalent?.toFixed(0) || '-'}</div>
                        <div class="eco-label">等效种树</div>
                    </div>
                </div>
            </div>

            <div class="result-section">
                <h3>💰 经济分析</h3>
                <div class="detail-row">
                    <span class="detail-label">初始投资</span>
                    <span class="detail-value">¥ ${(pvPotential.economics?.installation_cost / 10000)?.toFixed(0) || '-'} 万</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">年节省电费</span>
                    <span class="detail-value">¥ ${pvPotential.economics?.annual_savings?.toFixed(0) || '-'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">投资回收期</span>
                    <span class="detail-value">${pvPotential.economics?.payback_years?.toFixed(1) || '-'} 年</span>
                </div>
            </div>
        `;
    }

    hideAnalysisResults() {
        const resultsSection = document.getElementById('analysis-results');
        resultsSection.style.display = 'none';
        
        const legend = document.querySelector('.heatmap-legend');
        if (legend) {
            legend.remove();
        }
    }

    createMonthlyChart(monthlyData) {
        if (!monthlyData || monthlyData.length === 0) return '';
        
        const maxValue = Math.max(...monthlyData.map(m => m.radiation_kwh_m2));
        
        const bars = monthlyData.map((month, index) => {
            const height = (month.radiation_kwh_m2 / maxValue) * 100;
            const shortName = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'][index];
            
            return `
                <div class="month-bar" style="height: ${height}%;" title="${month.name}: ${month.radiation_kwh_m2.toFixed(1)} kWh/m²">
                    <span class="month-label">${shortName}</span>
                </div>
            `;
        }).join('');
        
        return `<div class="monthly-chart">${bars}</div>`;
    }

    createSeasonGrid(seasonalData) {
        if (!seasonalData) return '';
        
        const seasonNames = {
            'spring': '春季',
            'summer': '夏季',
            'autumn': '秋季',
            'winter': '冬季'
        };
        
        const items = Object.entries(seasonalData).map(([key, data]) => `
            <div class="season-item">
                <div class="season-name">${seasonNames[key] || key}</div>
                <div class="season-value">${data.total_kwh_m2?.toFixed(0) || '-'} kWh/m²</div>
            </div>
        `).join('');
        
        return `<div class="season-grid">${items}</div>`;
    }

    getOrientationName(azimuth) {
        const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
        const index = Math.round(((azimuth % 360) + 360) % 360 / 45) % 8;
        return directions[index];
    }

    createShadowSummary(hourlyShadow) {
        if (!hourlyShadow || hourlyShadow.length === 0) return '';

        const peakHours = hourlyShadow.filter(h => h.sun_elevation > 10);
        const avgShadowCoverage = peakHours.reduce((sum, h) => sum + h.shadow_coverage, 0) / peakHours.length;
        const avgShadowFactor = peakHours.reduce((sum, h) => sum + h.shadow_factor, 0) / peakHours.length;
        const severeShadowHours = peakHours.filter(h => h.shadow_coverage > 0.5).length;

        const shadowRating = avgShadowCoverage < 0.1 ? '优' : avgShadowCoverage < 0.3 ? '良' : avgShadowCoverage < 0.5 ? '中' : '差';
        const shadowColor = avgShadowCoverage < 0.1 ? '#2ecc71' : avgShadowCoverage < 0.3 ? '#f39c12' : avgShadowCoverage < 0.5 ? '#e67e22' : '#e74c3c';

        return `
            <div class="result-section">
                <h3>🌑 阴影分析</h3>
                <div class="shadow-rating" style="color: ${shadowColor};">
                    阴影影响评级: ${shadowRating}
                </div>
                <div class="detail-row">
                    <span class="detail-label">平均阴影覆盖率</span>
                    <span class="detail-value">${(avgShadowCoverage * 100).toFixed(1)}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">平均有效因子</span>
                    <span class="detail-value">${(avgShadowFactor * 100).toFixed(1)}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">严重阴影小时数</span>
                    <span class="detail-value">${severeShadowHours} 小时/天</span>
                </div>
            </div>
        `;
    }

    createHourlyShadowChart(hourlyShadow) {
        if (!hourlyShadow || hourlyShadow.length === 0) return '';

        const dayHours = hourlyShadow.filter(h => h.sun_elevation > 0);
        const maxCoverage = Math.max(...dayHours.map(h => h.shadow_coverage), 0.01);

        const bars = dayHours.map(h => {
            const height = (h.shadow_coverage / maxCoverage) * 100;
            const color = h.shadow_coverage < 0.25 ? '#2c7bb6' : h.shadow_coverage < 0.5 ? '#ffffbf' : '#ca0020';

            return `
                <div class="hour-bar-container" title="${h.hour}:00 - 覆盖率: ${(h.shadow_coverage * 100).toFixed(1)}%, 太阳高度: ${h.sun_elevation.toFixed(1)}°">
                    <div class="hour-bar" style="height: ${height}%; background-color: ${color};"></div>
                    <span class="hour-label">${h.hour}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="result-section">
                <h3>⏰ 逐时阴影分布</h3>
                <div class="hourly-shadow-chart">
                    ${bars}
                </div>
                <div class="chart-legend">
                    <span style="color: #2c7bb6;">■ 轻微</span>
                    <span style="color: #ffffbf;">■ 中等</span>
                    <span style="color: #ca0020;">■ 严重</span>
                </div>
            </div>
        `;
    }

    createPVLayoutSummary(pvLayout) {
        if (!pvLayout) return '';

        return `
            <div class="result-section">
                <h3>🔧 光伏板最佳布局</h3>
                <div class="result-value">
                    <span class="main-value">${pvLayout.total_panels || 0}</span>
                    <span class="unit">块组件</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">系统装机容量</span>
                    <span class="detail-value">${pvLayout.total_capacity_kw?.toFixed(1) || '-'} kW</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">组件规格</span>
                    <span class="detail-value">${pvLayout.panel_specs?.width_m || 1.0} × ${pvLayout.panel_specs?.height_m || 1.7} m, ${pvLayout.panel_specs?.power_kw || 0.4} kW</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">排间距</span>
                    <span class="detail-value">${pvLayout.row_spacing_m?.toFixed(2) || '-'} m</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">排布方式</span>
                    <span class="detail-value">${pvLayout.layout_pattern === 'landscape' ? '横向' : '竖向'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">预计年发电量</span>
                    <span class="detail-value">${(pvLayout.estimated_annual_generation_kwh / 1000)?.toFixed(1) || '-'} MWh</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">平均阴影因子</span>
                    <span class="detail-value">${(pvLayout.average_shadow_factor * 100)?.toFixed(1) || '-'}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">最佳日照时段</span>
                    <span class="detail-value">${pvLayout.best_sunlight_hours?.join(', ') || '-'}</span>
                </div>
            </div>
        `;
    }

    createRecommendations(pvLayout) {
        if (!pvLayout || !pvLayout.recommendations) return '';

        const priorityColors = {
            'high': '#e74c3c',
            'medium': '#f39c12',
            'low': '#3498db'
        };

        const recItems = pvLayout.recommendations.map(rec => `
            <div class="recommendation-item">
                <div class="rec-priority" style="background-color: ${priorityColors[rec.priority] || '#3498db'};">
                    ${rec.priority === 'high' ? '高' : rec.priority === 'medium' ? '中' : '低'}
                </div>
                <div class="rec-content">
                    <div class="rec-title">${rec.title}</div>
                    <div class="rec-desc">${rec.description}</div>
                </div>
            </div>
        `).join('');

        return `
            <div class="result-section">
                <h3>💡 优化建议</h3>
                <div class="recommendations-list">
                    ${recItems}
                </div>
                <div class="inverter-recommendation" style="margin-top: 16px; padding: 12px; background: rgba(52, 152, 219, 0.1); border-radius: 8px;">
                    <div style="font-weight: 600; margin-bottom: 8px;">🔌 逆变器配置建议</div>
                    <div style="font-size: 13px;">
                        类型: ${pvLayout.inverter_recommendation?.type === 'string' ? '组串式' : '集中式'}<br>
                        数量: ${pvLayout.inverter_recommendation?.count || 1} 台<br>
                        单台功率: ${pvLayout.inverter_recommendation?.power_per_unit_kw || 50} kW
                    </div>
                </div>
            </div>
        `;
    }

    updateStats() {
        const totalBuildings = this.buildings.length;
        const analyzedBuildings = this.buildings.filter(b => b.last_analysis).length;
        
        let totalArea = 0;
        let totalPotential = 0;
        
        for (const building of this.buildings) {
            const roofGeo = building.roof_geometry;
            if (roofGeo && roofGeo.coordinates && roofGeo.coordinates[0]) {
                const coords = roofGeo.coordinates[0];
                if (coords.length >= 3) {
                    totalArea += this.estimateArea(coords);
                }
            }
            
            if (building.last_analysis) {
                totalPotential += building.last_analysis.pv_potential?.annual_ac_kwh || 0;
            }
        }
        
        document.getElementById('stat-buildings').textContent = totalBuildings;
        document.getElementById('stat-analyzed').textContent = analyzedBuildings;
        document.getElementById('stat-area').textContent = totalArea.toFixed(0) + ' m²';
        document.getElementById('stat-potential').textContent = (totalPotential / 1000).toFixed(1) + ' MWh';
    }

    estimateArea(coordinates) {
        if (coordinates.length < 3) return 0;
        
        const lats = coordinates.map(c => c[1]);
        const lons = coordinates.map(c => c[0]);
        
        const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        
        const latRange = Math.max(...lats) - Math.min(...lats);
        const lonRange = Math.max(...lons) - Math.min(...lons);
        
        const latMeters = latRange * 111320;
        const lonMeters = lonRange * 111320 * 0.866;
        
        return latMeters * lonMeters * 0.9;
    }

    setupEventListeners() {
        document.getElementById('btn-reload-buildings').addEventListener('click', () => {
            this.loadBuildings();
        });

        document.getElementById('btn-calculate').addEventListener('click', () => {
            if (this.roofSelection && this.selectedBuildingId) {
                this.roofSelection.calculateForSelectedBuilding();
            }
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            if (this.roofSelection) {
                this.roofSelection.clearSelection();
            }
            this.currentAnalysisResult = null;

            const calculateBtn = document.getElementById('btn-calculate');
            calculateBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                计算太阳辐射
            `;
        });

        document.getElementById('toggle-buildings').addEventListener('change', (e) => {
            if (this.cesiumRenderer) {
                this.cesiumRenderer.setBuildingsVisibility(e.target.checked);
            }
        });

        document.getElementById('toggle-roofs').addEventListener('change', (e) => {
            if (this.cesiumRenderer && this.cesiumRenderer.viewer) {
                const visible = e.target.checked;
                for (const buildingId in this.cesiumRenderer.buildingEntities) {
                    const roofEntity = this.cesiumRenderer.viewer.entities.getById(`${buildingId}_roof`);
                    if (roofEntity) {
                        roofEntity.show = visible;
                    }
                }
            }
        });

        document.getElementById('toggle-heatmap').addEventListener('change', (e) => {
            if (this.cesiumRenderer) {
                const visible = e.target.checked;
                this.cesiumRenderer.heatmapEntities.forEach(entity => {
                    entity.show = visible;
                });
            }
        });

        document.getElementById('toggle-shadow-heatmap').addEventListener('change', (e) => {
            if (this.cesiumRenderer) {
                const visible = e.target.checked;
                this.cesiumRenderer.shadowHeatmapEntities.forEach(entity => {
                    entity.show = visible;
                });
            }
        });

        document.getElementById('toggle-pv-layout').addEventListener('change', (e) => {
            if (this.cesiumRenderer) {
                const visible = e.target.checked;
                this.cesiumRenderer.pvLayoutEntities.forEach(entity => {
                    entity.show = visible;
                });
            }
        });

        document.getElementById('shadow-hour').addEventListener('change', async (e) => {
            if (!this.currentAnalysisResult || !this.currentAnalysisResult.hourly_shadow) return;

            const hour = e.target.value ? parseInt(e.target.value) : null;
            const buildingId = this.selectedBuildingId;
            const buildingData = this.roofSelection?.getBuildingData(buildingId);

            if (buildingId && buildingData) {
                try {
                    const params = {
                        building_id: buildingId,
                        roof_geometry: buildingData.roof_geometry,
                        latitude: buildingData.location?.latitude,
                        longitude: buildingData.location?.longitude,
                        day_of_year: parseInt(document.getElementById('shadow-day-of-year').value),
                        hour: hour
                    };

                    const result = await apiClient.calculateShadow(params);

                    if (result.shadow_heatmap) {
                        this.cesiumRenderer.addShadowHeatmapGrid(result.shadow_heatmap, buildingData.height || 15);
                    }
                } catch (error) {
                    console.error('Shadow calculation error:', error);
                }
            }
        });

        document.getElementById('enable-shadow-calc').addEventListener('change', (e) => {
            this.enableShadowCalculation = e.target.checked;
        });
    }

    showNotification(message, type = 'info') {
        const colors = {
            info: '#3498db',
            success: '#2ecc71',
            warning: '#f39c12',
            error: '#e74c3c'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = message;
        notification.innerHTML += `
            <style>
                @keyframes slideInRight {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SolarPotentialApp();
});

window.app = app;
