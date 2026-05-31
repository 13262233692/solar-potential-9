# 城市级光伏潜力评估系统 - Solar Potential Assessment System

基于Cesium.js和PVlib开发的城市级建筑屋顶光伏潜力评估Web应用。

## 项目概述

本系统实现了城市建筑屋顶的太阳能辐射量计算和光伏发电潜力评估，通过3D可视化界面展示分析结果，为城市光伏规划提供决策支持。

## 技术架构

### 前端技术栈
- **Cesium.js** - 3D地球渲染引擎，加载城市3D Tiles模型
- **Vanilla JavaScript** - 原生JavaScript实现各功能模块
- **HTML5/CSS3** - 现代化UI界面设计

### 后端技术栈
- **Python 3.8+** - 主开发语言
- **Flask** - Web框架，提供RESTful API
- **PVlib** - 太阳辐射计算库，实现Simple Sky Dome模型
- **Shapely** - 几何分析库，处理屋顶几何数据
- **NumPy/Pandas** - 科学计算和数据处理

## 功能模块

### 1. Cesium渲染模块 ([cesiumRenderer.js](file:///d:/SOLO-1/solar-potential-9/frontend/js/cesiumRenderer.js))
- 3D城市模型加载与渲染
- 3D Tiles数据支持
- 建筑实体可视化
- 相机控制与视角管理
- 热力图叠加渲染

### 2. 屋顶选择交互模块 ([roofSelection.js](file:///d:/SOLO-1/solar-potential-9/frontend/js/roofSelection.js))
- 建筑屋顶点击选择
- 悬停高亮效果
- 键盘快捷键支持
- 计算流程管理
- 加载状态提示

### 3. 辐射计算服务 ([radiation_calculator.py](file:///d:/SOLO-1/solar-potential-9/backend/radiation_calculator.py))
- Simple Sky Dome模型实现
- 年太阳辐射量计算
- 月度/季节辐射分布
- 天空扇区分析
- 光伏发电潜力估算
- 经济效益分析

### 4. 热力图生成模块 ([heatmapGenerator.js](file:///d:/SOLO-1/solar-potential-9/frontend/js/heatmapGenerator.js))
- 多配色方案支持 (jet, viridis, plasma等)
- 空间插值渲染
- 交互式图例
- 统计分析
- 分布图生成
- 图片导出功能

### 5. 屋顶几何分析模块 ([geometry_analyzer.py](file:///d:/SOLO-1/solar-potential-9/backend/geometry_analyzer.py))
- 屋顶面积计算
- 屋顶类型分类
- 倾角/朝向分析
- 热力图网格生成
- 阴影影响评估
- 几何简化处理

### 6. 建筑数据管理模块 ([building_data_manager.py](file:///d:/SOLO-1/solar-potential-9/backend/building_data_manager.py))
- 建筑CRUD操作
- 数据持久化存储
- 批量导入导出
- 统计分析功能
- GeoJSON格式支持

## 项目目录结构

```
solar-potential-9/
├── backend/                    # 后端Python服务
│   ├── app.py                 # Flask主应用
│   ├── radiation_calculator.py # 辐射计算服务
│   ├── geometry_analyzer.py   # 几何分析模块
│   ├── building_data_manager.py # 数据管理模块
│   ├── test_api.py            # 测试文件
│   ├── requirements.txt       # Python依赖
│   └── run.bat                # 后端启动脚本
├── frontend/                   # 前端Web应用
│   ├── index.html             # 主页面
│   ├── js/
│   │   ├── apiClient.js       # API客户端
│   │   ├── cesiumRenderer.js  # Cesium渲染模块
│   │   ├── roofSelection.js   # 屋顶选择交互
│   │   ├── heatmapGenerator.js # 热力图生成
│   │   └── app.js             # 主应用逻辑
│   ├── css/
│   │   └── style.css          # 样式文件
│   ├── data/                  # 数据目录
│   └── run.bat                # 前端启动脚本
├── start.bat                  # 一键启动脚本
└── README.md                  # 项目说明
```

## 快速开始

### 环境要求
- Python 3.8+
- 现代浏览器 (Chrome/Firefox/Edge)
- 网络连接 (加载Cesium.js和地形数据)

### 安装与运行

#### 方式一：一键启动 (推荐)
```bash
# 双击运行或命令行执行
start.bat
```

#### 方式二：分别启动

**1. 启动后端服务**
```bash
cd backend
pip install -r requirements.txt
python app.py
```
后端API将运行在 http://localhost:5000

**2. 启动前端服务**
```bash
cd frontend
python -m http.server 8080
```
前端页面将运行在 http://localhost:8080

### 访问应用
打开浏览器访问 http://localhost:8080

## API接口文档

### 健康检查
```
GET /api/health
```

### 建筑管理
```
GET    /api/buildings              # 获取所有建筑
GET    /api/buildings/<id>         # 获取单个建筑
POST   /api/buildings              # 新增建筑
PUT    /api/buildings/<id>         # 更新建筑
DELETE /api/buildings/<id>         # 删除建筑
```

### 辐射计算
```
POST /api/calculate/radiation      # 计算太阳辐射
POST /api/calculate/heatmap        # 生成热力图
POST /api/analyze/roof             # 屋顶几何分析
```

### 辐射计算请求参数
```json
{
  "building_id": "building_001",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "roof_geometry": {
    "type": "Polygon",
    "coordinates": [[[lon, lat], ...]]
  },
  "tilt": 0,
  "azimuth": 180
}
```

### 响应示例
```json
{
  "building_id": "building_001",
  "radiation": {
    "annual_radiation_kwh_m2": 1250.5,
    "monthly_radiation": [...],
    "seasonal_radiation": {...}
  },
  "heatmap": {
    "grid": [...],
    "min_value": 1100,
    "max_value": 1400
  },
  "pv_potential": {
    "annual_ac_kwh": 150000,
    "co2_reduction_tonnes": 117.75,
    "economics": {...}
  }
}
```

## 使用说明

### 基本操作流程
1. **选择建筑** - 在3D地图上左键点击建筑屋顶，或在左侧建筑列表中点击
2. **查看信息** - 右侧面板显示建筑详细信息
3. **计算辐射** - 点击"计算太阳辐射"按钮或按Enter键
4. **查看结果** - 热力图自动叠加在屋顶上，右侧面板显示详细分析
5. **切换图层** - 使用左下角复选框控制各图层显示

### 快捷键
- `左键点击` - 选择建筑
- `右键点击/Esc` - 取消选择
- `Enter` - 计算选中建筑
- `Ctrl+Enter` - 强制重新计算
- `鼠标滚轮` - 缩放视图
- `拖拽旋转` - 旋转3D视角

## 核心算法

### Simple Sky Dome模型
基于PVlib实现的简化天空穹顶模型，考虑：
- 太阳位置计算（赤纬角、时角）
- 大气质量和透明度
- 直射辐射、散射辐射、反射辐射
- 表面倾角和朝向影响
- 天空各向异性模型（Perez模型）

### 辐射计算流程
1. 获取全年逐时太阳位置
2. 计算逐时DNI、GHI、DHI
3. 计算斜面总辐射（POA）
4. 统计月度、季节、年度总量
5. 生成热力图网格数据

## 测试

运行后端测试：
```bash
cd backend
pip install pytest
pytest test_api.py -v
```

直接运行测试脚本：
```bash
cd backend
python test_api.py
```

## 扩展功能建议

1. **真实3D城市模型** - 接入Cesium Ion 3D Tiles或OSM建筑数据
2. **实时气象数据** - 接入气象局API获取真实辐射数据
3. **阴影分析** - 考虑周围建筑对屋顶的遮挡
4. **经济模型优化** - 支持不同地区电价和补贴政策
5. **批量分析** - 支持区域级批量建筑分析
6. **报告导出** - 生成PDF格式的评估报告
7. **移动端适配** - 响应式设计支持移动设备

## 常见问题

### Q: Cesium加载很慢或无法显示？
A: 请检查网络连接，Cesium需要从CDN加载。也可以使用本地部署的Cesium资源。

### Q: 后端启动失败？
A: 检查Python版本是否3.8+，依赖是否正确安装。可尝试手动安装：`pip install flask pvlib shapely`

### Q: 热力图不显示？
A: 确保已选择建筑并完成计算。检查浏览器控制台是否有错误信息。

### Q: 如何添加自定义建筑？
A: 可以通过API `POST /api/buildings` 添加，或直接编辑 `backend/buildings.json` 文件。

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交Issue。
