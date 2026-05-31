class HeatmapGenerator {
    constructor(options = {}) {
        this.options = {
            colormap: options.colormap || 'jet',
            opacity: options.opacity || 0.8,
            interpolate: options.interpolate !== false,
            showLegend: options.showLegend !== false,
            ...options
        };

        this.colormaps = {
            jet: [
                { pos: 0.0, r: 0, g: 0, b: 136 },
                { pos: 0.125, r: 0, g: 0, b: 255 },
                { pos: 0.25, r: 0, g: 255, b: 255 },
                { pos: 0.375, r: 0, g: 255, b: 0 },
                { pos: 0.5, r: 255, g: 255, b: 0 },
                { pos: 0.625, r: 255, g: 136, b: 0 },
                { pos: 0.75, r: 255, g: 0, b: 0 },
                { pos: 0.875, r: 136, g: 0, b: 0 },
                { pos: 1.0, r: 20, g: 0, b: 0 }
            ],
            viridis: [
                { pos: 0.0, r: 68, g: 1, b: 84 },
                { pos: 0.2, r: 72, g: 40, b: 120 },
                { pos: 0.4, r: 62, g: 73, b: 137 },
                { pos: 0.6, r: 49, g: 104, b: 142 },
                { pos: 0.8, r: 38, g: 130, b: 142 },
                { pos: 1.0, r: 12, g: 232, b: 157 }
            ],
            plasma: [
                { pos: 0.0, r: 13, g: 8, b: 135 },
                { pos: 0.2, r: 75, g: 3, b: 161 },
                { pos: 0.4, r: 125, g: 3, b: 168 },
                { pos: 0.6, r: 194, g: 48, b: 103 },
                { pos: 0.8, r: 240, g: 108, b: 32 },
                { pos: 1.0, r: 240, g: 249, b: 33 }
            ],
            inferno: [
                { pos: 0.0, r: 0, g: 0, b: 4 },
                { pos: 0.2, r: 40, g: 12, b: 42 },
                { pos: 0.4, r: 101, g: 21, b: 110 },
                { pos: 0.6, r: 171, g: 55, b: 58 },
                { pos: 0.8, r: 222, g: 112, b: 25 },
                { pos: 1.0, r: 252, g: 255, b: 164 }
            ],
            hot: [
                { pos: 0.0, r: 0, g: 0, b: 0 },
                { pos: 0.2, r: 127, g: 0, b: 0 },
                { pos: 0.4, r: 255, g: 0, b: 0 },
                { pos: 0.6, r: 255, g: 127, b: 0 },
                { pos: 0.8, r: 255, g: 255, b: 0 },
                { pos: 1.0, r: 255, g: 255, b: 255 }
            ],
            coolwarm: [
                { pos: 0.0, r: 59, g: 76, b: 192 },
                { pos: 0.5, r: 221, g: 221, b: 221 },
                { pos: 1.0, r: 180, g: 4, b: 38 }
            ],
            blues: [
                { pos: 0.0, r: 247, g: 251, b: 255 },
                { pos: 0.25, r: 198, g: 219, b: 239 },
                { pos: 0.5, r: 107, g: 174, b: 214 },
                { pos: 0.75, r: 33, g: 113, b: 181 },
                { pos: 1.0, r: 8, g: 48, b: 107 }
            ],
            greens: [
                { pos: 0.0, r: 247, g: 252, b: 245 },
                { pos: 0.25, r: 186, g: 228, b: 179 },
                { pos: 0.5, r: 102, g: 194, b: 165 },
                { pos: 0.75, r: 35, g: 139, b: 69 },
                { pos: 1.0, r: 0, g: 68, b: 27 }
            ],
            spectral: [
                { pos: 0.0, r: 158, g: 1, b: 66 },
                { pos: 0.2, r: 213, g: 62, b: 79 },
                { pos: 0.4, r: 244, g: 109, b: 67 },
                { pos: 0.6, r: 253, g: 174, b: 97 },
                { pos: 0.8, r: 254, g: 224, b: 144 },
                { pos: 1.0, r: 230, g: 245, b: 152 }
            ]
        };
    }

    getColor(value, minValue, maxValue, colormapName = null) {
        const colormap = this.colormaps[colormapName || this.options.colormap] || this.colormaps.jet;

        if (minValue === maxValue) {
            return this.rgbToColor(colormap[0].r, colormap[0].g, colormap[0].b, this.options.opacity);
        }

        const normalized = (value - minValue) / (maxValue - minValue);
        const clamped = Math.max(0, Math.min(1, normalized));

        for (let i = 0; i < colormap.length - 1; i++) {
            if (clamped >= colormap[i].pos && clamped <= colormap[i + 1].pos) {
                const range = colormap[i + 1].pos - colormap[i].pos;
                const factor = (clamped - colormap[i].pos) / range;

                const r = colormap[i].r + factor * (colormap[i + 1].r - colormap[i].r);
                const g = colormap[i].g + factor * (colormap[i + 1].g - colormap[i].g);
                const b = colormap[i].b + factor * (colormap[i + 1].b - colormap[i].b);

                return this.rgbToColor(r, g, b, this.options.opacity);
            }
        }

        return this.rgbToColor(colormap[colormap.length - 1].r, colormap[colormap.length - 1].g, colormap[colormap.length - 1].b, this.options.opacity);
    }

    rgbToColor(r, g, b, alpha = 1) {
        return {
            r: r / 255,
            g: g / 255,
            b: b / 255,
            alpha: alpha,
            css: `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`,
            hex: this.rgbToHex(r, g, b)
        };
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    generateHeatmapCanvas(gridData, width, height, options = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!gridData || !gridData.grid || gridData.grid.length === 0) {
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            return canvas;
        }

        const { grid, min_value, max_value } = gridData;
        const colormapName = options.colormap || this.options.colormap;

        const lats = grid.map(p => p.latitude);
        const lons = grid.map(p => p.longitude);

        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        if (this.options.interpolate) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const lon = minLon + (x / width) * (maxLon - minLon);
                    const lat = maxLat - (y / height) * (maxLat - minLat);

                    const value = this.interpolateValue(lon, lat, grid, min_value, max_value);
                    const color = this.getColor(value, min_value, max_value, colormapName);

                    const idx = (y * width + x) * 4;
                    data[idx] = Math.round(color.r * 255);
                    data[idx + 1] = Math.round(color.g * 255);
                    data[idx + 2] = Math.round(color.b * 255);
                    data[idx + 3] = Math.round(color.alpha * 255);
                }
            }
        } else {
            const gridSize = gridData.grid_size || 2;
            const cellWidth = width / Math.ceil((maxLon - minLon) / (gridSize / 111320));
            const cellHeight = height / Math.ceil((maxLat - minLat) / (gridSize / 111320));

            for (const point of grid) {
                const x = Math.floor((point.longitude - minLon) / (maxLon - minLon) * width);
                const y = Math.floor((maxLat - point.latitude) / (maxLat - minLat) * height);

                const color = this.getColor(point.value, min_value, max_value, colormapName);

                for (let dx = 0; dx < cellWidth && x + dx < width; dx++) {
                    for (let dy = 0; dy < cellHeight && y + dy < height; dy++) {
                        const idx = ((y + dy) * width + (x + dx)) * 4;
                        data[idx] = Math.round(color.r * 255);
                        data[idx + 1] = Math.round(color.g * 255);
                        data[idx + 2] = Math.round(color.b * 255);
                        data[idx + 3] = Math.round(color.alpha * 255);
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    interpolateValue(lon, lat, gridPoints, minValue, maxValue) {
        let totalWeight = 0;
        let weightedSum = 0;
        const power = 2;
        const maxDistance = 0.0001;

        for (const point of gridPoints) {
            const dx = lon - point.longitude;
            const dy = lat - point.latitude;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 0.00001) {
                return point.value;
            }

            if (distance < maxDistance) {
                const weight = 1 / Math.pow(distance, power);
                weightedSum += weight * point.value;
                totalWeight += weight;
            }
        }

        if (totalWeight > 0) {
            return weightedSum / totalWeight;
        }

        return (minValue + maxValue) / 2;
    }

    createLegend(options = {}) {
        const container = document.createElement('div');
        container.className = 'heatmap-legend';
        container.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            font-family: sans-serif;
            font-size: 12px;
            z-index: 1000;
            min-width: 200px;
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: bold; margin-bottom: 10px; color: #333;';
        title.textContent = options.title || 'Solar Radiation (kWh/m²/year)';
        container.appendChild(title);

        const gradientContainer = document.createElement('div');
        gradientContainer.style.cssText = 'position: relative; height: 20px; margin-bottom: 8px;';

        const colormapName = options.colormap || this.options.colormap;
        const colormap = this.colormaps[colormapName] || this.colormaps.jet;

        const gradient = document.createElement('div');
        const stops = colormap.map(c => `rgb(${c.r}, ${c.g}, ${c.b}) ${c.pos * 100}%`).join(', ');
        gradient.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(to right, ${stops});
            border-radius: 4px;
        `;
        gradientContainer.appendChild(gradient);
        container.appendChild(gradientContainer);

        const labelsContainer = document.createElement('div');
        labelsContainer.style.cssText = 'display: flex; justify-content: space-between; color: #666;';

        const minLabel = document.createElement('span');
        minLabel.textContent = options.minValue !== undefined ? options.minValue.toFixed(0) : 'Low';
        labelsContainer.appendChild(minLabel);

        const midLabel = document.createElement('span');
        midLabel.textContent = options.midValue !== undefined ? options.midValue.toFixed(0) : '';
        labelsContainer.appendChild(midLabel);

        const maxLabel = document.createElement('span');
        maxLabel.textContent = options.maxValue !== undefined ? options.maxValue.toFixed(0) : 'High';
        labelsContainer.appendChild(maxLabel);

        container.appendChild(labelsContainer);

        if (options.unit) {
            const unitLabel = document.createElement('div');
            unitLabel.style.cssText = 'text-align: center; margin-top: 5px; color: #888; font-size: 11px;';
            unitLabel.textContent = options.unit;
            container.appendChild(unitLabel);
        }

        return container;
    }

    generateStatistics(gridData) {
        if (!gridData || !gridData.grid || gridData.grid.length === 0) {
            return null;
        }

        const values = gridData.grid.map(p => p.value);
        const sorted = [...values].sort((a, b) => a - b);

        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;

        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const median = sorted[Math.floor(sorted.length * 0.5)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];

        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        return {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            mean: mean,
            median: median,
            q1: q1,
            q3: q3,
            stdDev: stdDev,
            sum: sum,
            range: Math.max(...values) - Math.min(...values)
        };
    }

    exportHeatmapImage(gridData, width = 800, height = 600, format = 'png') {
        const canvas = this.generateHeatmapCanvas(gridData, width, height);

        if (format === 'png') {
            return canvas.toDataURL('image/png');
        } else if (format === 'jpeg') {
            return canvas.toDataURL('image/jpeg', 0.9);
        }

        return canvas.toDataURL();
    }

    downloadHeatmap(gridData, filename = 'heatmap', width = 800, height = 600) {
        const dataUrl = this.exportHeatmapImage(gridData, width, height);

        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = dataUrl;
        link.click();
    }

    createInteractiveLegend(gridData, options = {}) {
        const legend = this.createLegend({
            ...options,
            minValue: gridData.min_value,
            maxValue: gridData.max_value,
            midValue: (gridData.min_value + gridData.max_value) / 2
        });

        const tooltip = document.createElement('div');
        tooltip.style.cssText = `
            position: absolute;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 11px;
            pointer-events: none;
            display: none;
            z-index: 1001;
            white-space: nowrap;
        `;
        legend.appendChild(tooltip);

        const gradient = legend.querySelector('div > div:nth-child(2)');
        if (gradient) {
            gradient.addEventListener('mousemove', (e) => {
                const rect = gradient.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                const value = gridData.min_value + percent * (gridData.max_value - gridData.min_value);

                tooltip.style.display = 'block';
                tooltip.style.left = `${x + 10}px`;
                tooltip.style.bottom = '30px';
                tooltip.textContent = value.toFixed(1) + ' kWh/m²';
            });

            gradient.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        }

        return legend;
    }

    getAvailableColormaps() {
        return Object.keys(this.colormaps);
    }

    setColormap(colormapName) {
        if (this.colormaps[colormapName]) {
            this.options.colormap = colormapName;
            return true;
        }
        return false;
    }

    generateValueDistribution(gridData, bucketCount = 10) {
        if (!gridData || !gridData.grid || gridData.grid.length === 0) {
            return [];
        }

        const values = gridData.grid.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bucketSize = (max - min) / bucketCount;

        const buckets = [];
        for (let i = 0; i < bucketCount; i++) {
            const bucketMin = min + i * bucketSize;
            const bucketMax = min + (i + 1) * bucketSize;
            const count = values.filter(v => v >= bucketMin && (i === bucketCount - 1 ? v <= bucketMax : v < bucketMax)).length;

            buckets.push({
                min: bucketMin,
                max: bucketMax,
                count: count,
                percentage: (count / values.length) * 100,
                color: this.getColor((bucketMin + bucketMax) / 2, min, max)
            });
        }

        return buckets;
    }

    createDistributionChart(gridData, bucketCount = 10) {
        const distribution = this.generateValueDistribution(gridData, bucketCount);
        if (distribution.length === 0) return null;

        const container = document.createElement('div');
        container.style.cssText = `
            font-family: sans-serif;
            font-size: 12px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: bold; margin-bottom: 15px; color: #333;';
        title.textContent = 'Radiation Distribution';
        container.appendChild(title);

        const chart = document.createElement('div');
        chart.style.cssText = 'display: flex; align-items: flex-end; gap: 2px; height: 120px; margin-bottom: 10px;';

        const maxCount = Math.max(...distribution.map(d => d.count));

        for (const bucket of distribution) {
            const bar = document.createElement('div');
            const height = (bucket.count / maxCount) * 100;
            bar.style.cssText = `
                flex: 1;
                background: ${bucket.color.css};
                height: ${height}%;
                min-height: 2px;
                border-radius: 2px 2px 0 0;
                transition: all 0.2s;
                position: relative;
            `;
            bar.title = `${bucket.min.toFixed(0)} - ${bucket.max.toFixed(0)} kWh/m²: ${bucket.count} points (${bucket.percentage.toFixed(1)}%)`;
            chart.appendChild(bar);
        }

        container.appendChild(chart);

        const labels = document.createElement('div');
        labels.style.cssText = 'display: flex; justify-content: space-between; color: #666; font-size: 10px;';
        labels.innerHTML = `<span>${distribution[0].min.toFixed(0)}</span><span>${distribution[Math.floor(distribution.length / 2)].min.toFixed(0)}</span><span>${distribution[distribution.length - 1].max.toFixed(0)}</span>`;
        container.appendChild(labels);

        return container;
    }
}

window.HeatmapGenerator = HeatmapGenerator;
