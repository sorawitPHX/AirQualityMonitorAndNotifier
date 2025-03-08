// จำนวนข้อมูลสูงสุดที่เก็บไว้ในกราฟ
const maxDataPoints = 50;
// ฟังก์ชันสร้างกราฟ
// ✅ เก็บข้อมูลทั้งหมดตั้งแต่เปิดเว็บ
const fullData = {
    temperature: [],
    humid: [],
    pm25: [],
    co2: [],
    co: []
};

// ✅ แสดงเฉพาะ 50 จุดล่าสุด
const latestData = {
    temperature: [],
    humid: [],
    pm25: [],
    co2: [],
    co: []
};

function loadMoreData(chartContext, xaxis) {
    const chartName = chartContext.w.config.series[0].name; // ดึงชื่อซีรีส์ของกราฟ
    const type = getChartType(chartName); // หา key ที่ถูกต้องจาก charts

    if (!type || !fullData[type] || !charts[type]) return; // ป้องกัน error

    const oldData = fullData[type].filter(d => d.x < xaxis.min); // โหลดข้อมูลเก่าก่อนช่วง zoom
    if (oldData.length === 0) return; // ถ้าไม่มีข้อมูลเก่า ไม่ต้องอัปเดต

    const combinedData = [...oldData, ...latestData[type]]; // รวมข้อมูล

    // 🔵 ใช้ charts[type] เพื่ออัปเดตกราฟ
    charts[type].updateSeries([{ data: combinedData }]);
}

// ✅ ฟังก์ชันช่วยหา key ของ charts จากชื่อซีรีส์
function getChartType(chartName) {
    return Object.keys(charts).find(key => charts[key].w.config.series[0].name === chartName);
}

function createChart(element, label, color) {
    return new ApexCharts(document.querySelector(element), {
        chart: {
            type: "line",
            height: 250,
            animations: {
                enabled: true,
                easing: 'linear',
            },
            toolbar: { show: true },
            zoom: { enabled: true },
            events: {
                beforeZoom: (chartContext, { xaxis }) => {
                    loadMoreData(chartContext, xaxis);
                }
            }
        },
        series: [{ name: label, data: [] }],
        xaxis: { type: "datetime" },
        colors: [color],
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth'
        },
        title: {
            text: label,
            align: 'center'
        },
        markers: {
            size: 0
        },
        xaxis: {
            type: 'datetime',
        },
        yaxis: {
            min: 0
        },
        legend: {
            show: true
        },
        noData: { text: "กำลังรอข้อมูล..." },
        tooltip: {
            enabled: true,
            shared: true,
            intersect: false,
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                const timestamp = new Date(w.globals.seriesX[seriesIndex][dataPointIndex]).toLocaleString();
                const value = series[seriesIndex][dataPointIndex];
                return `
                <div class="tooltip p-3">
                    <strong>Timestamp:</strong> ${timestamp}<br>
                    <strong>Value:</strong> ${value}
                </div>
            `;
            }
        }
    });
}

// สร้าง 5 กราฟ
const charts = {
    temperature: createChart("#tempChart", "Temperature (°C)", "#ff0000"),
    humid: createChart("#humidChart", "Humidity (%)", "#0000ff"),
    pm25: createChart("#pmChart", "PM2.5 (ug/m³)", "#00ff00"),
    co2: createChart("#co2Chart", "CO2 (ppm)", "#800080"),
    co: createChart("#coChart", "CO (ppm)", "#ffa500")
};

// เรนเดอร์กราฟทั้งหมด
Object.values(charts).forEach(chart => chart.render());

// เก็บค่าข้อมูลทั้งหมด ตั้งแต่เปิดเว็บ
// ✅ ฟังก์ชันอัปเดตข้อมูล
let isUpdating = true;  // กำหนดตัวแปรสำหรับการอัปเดตกราฟ
function updateChart(type, value) {
    const time = new Date().getTime();
    // 🔵 เก็บข้อมูลทั้งหมด
    fullData[type].push({ x: time, y: value });
    // 🔵 ตัดให้เหลือแค่ 50 จุดล่าสุด
    latestData[type] = fullData[type].slice(-50);
    if (isUpdating) {
        charts[type].updateSeries([{ data: [...latestData[type]] }]);
    }
}



// สร้าง 5 กราฟ
// const tempChart = createChart("#tempChart", "Temperature (°C)", "#ff0000");
// const humidChart = createChart("#humidChart", "Humidity (%)", "#0000ff");
// const pmChart = createChart("#pmChart", "PM2.5 (ug/m³)", "#00ff00");
// const co2Chart = createChart("#co2Chart", "CO2 (ppm)", "#800080");
// const coChart = createChart("#coChart", "CO (ppm)", "#ffa500");

// เรนเดอร์กราฟทั้งหมด
// tempChart.render();
// humidChart.render();
// pmChart.render();
// co2Chart.render();
// coChart.render();

// ฟังก์ชันอัปเดตข้อมูล
// function updateChart(chart, value, timestamp = new Date()) {
//     // const timestamp = new Date().getTime(); // Timestamp ปัจจุบัน
//     const newData = { x: timestamp, y: value };
//     // จำกัดจำนวนจุดข้อมูล
//     if (chart.w.config.series[0].data.length >= maxDataPoints) {
//         chart.w.config.series[0].data.shift();
//     }
//     // เพิ่มข้อมูลใหม่
//     chart.updateSeries([{ data: [...chart.w.config.series[0].data, newData] }]);

//     // ดึงค่า min/max ของ xaxis (ป้องกันการ reset zoom)
//     const prevXAxis = chart.w.globals.minX ? {
//         min: chart.w.globals.minX,
//         max: chart.w.globals.maxX
//     } : {};
// }
