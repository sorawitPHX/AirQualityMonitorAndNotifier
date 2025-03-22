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
    if (!type || !fullData[type] || !charts[type]) {
        console.log(`type fullData chart ไม่มี`)
        return;
    } // ป้องกัน error
    const combinedData = [...fullData[type]]; // รวมข้อมูล
    // 🔵 ใช้ charts[type] เพื่ออัปเดตกราฟ
    charts[type].updateSeries([{ data: combinedData }]);
}

// ✅ ฟังก์ชันช่วยหา key ของ charts จากชื่อซีรีส์
function getChartType(chartName) {
    let type = Object.keys(charts).find(key => charts[key].w.config.series[0].name === chartName);
    console.log(type)
    return type
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
                    // console.log(chartContext)
                }
            }
        },
        series: [{ name: label, data: [] }],
        xaxis: {
            type: "datetime",
            labels: {
                datetimeUTC: false,
            }
        },
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


// เก็บค่าข้อมูลทั้งหมด ตั้งแต่เปิดเว็บ
// ✅ ฟังก์ชันอัปเดตข้อมูล
let isUpdating = true;  // กำหนดตัวแปรสำหรับการอัปเดตกราฟ
function updateChart(type, value, time) {
    console.log(time)
    time = new Date(time).getTime()
    const newTime = new Date()
    // 🔵 เก็บข้อมูลทั้งหมด
    fullData[type].push({ x: newTime, y: value });
    // 🔵 ตัดให้เหลือแค่ 50 จุดล่าสุด
    latestData[type] = fullData[type].slice(-50);
    if (isUpdating) {
        charts[type].updateSeries([{ data: [...latestData[type]] }]);
    }
}

let charts = {}
document.addEventListener('DOMContentLoaded', async () => {
    charts = {
        temperature: createChart("#tempChart", "Temperature (°C)", "#ff0000"),
        humid: createChart("#humidChart", "Humidity (%)", "#0000ff"),
        pm25: createChart("#pmChart", "PM2.5 (ug/m³)", "#00ff00"),
        co2: createChart("#co2Chart", "CO2 (ppm)", "#800080"),
        co: createChart("#coChart", "CO (ppm)", "#ffa500")
    };
    Object.values(charts).forEach(chart => chart.render());
})
