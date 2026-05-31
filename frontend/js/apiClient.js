class ApiClient {
    constructor(baseUrl = 'http://localhost:5000/api') {
        this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const config = { ...defaultOptions, ...options };
        if (config.body && typeof config.body !== 'string') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${url}`, error);
            throw error;
        }
    }

    async healthCheck() {
        return this.request('/health', { method: 'GET' });
    }

    async getBuildings() {
        return this.request('/buildings', { method: 'GET' });
    }

    async getBuilding(buildingId) {
        return this.request(`/buildings/${buildingId}`, { method: 'GET' });
    }

    async addBuilding(buildingData) {
        return this.request('/buildings', {
            method: 'POST',
            body: buildingData
        });
    }

    async updateBuilding(buildingId, buildingData) {
        return this.request(`/buildings/${buildingId}`, {
            method: 'PUT',
            body: buildingData
        });
    }

    async deleteBuilding(buildingId) {
        return this.request(`/buildings/${buildingId}`, {
            method: 'DELETE'
        });
    }

    async calculateRadiation(calculationParams) {
        return this.request('/calculate/radiation', {
            method: 'POST',
            body: calculationParams
        });
    }

    async generateHeatmap(heatmapParams) {
        return this.request('/calculate/heatmap', {
            method: 'POST',
            body: heatmapParams
        });
    }

    async analyzeRoof(roofParams) {
        return this.request('/analyze/roof', {
            method: 'POST',
            body: roofParams
        });
    }

    async calculateShadow(shadowParams) {
        return this.request('/calculate/shadow', {
            method: 'POST',
            body: shadowParams
        });
    }

    async calculateLayout(layoutParams) {
        return this.request('/calculate/layout', {
            method: 'POST',
            body: layoutParams
        });
    }
}

const apiClient = new ApiClient();
window.apiClient = apiClient;
