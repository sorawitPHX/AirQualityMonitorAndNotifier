const SensorData = require('../models/SensorData')

async function insertSensorData(data) {
    try {
        const sensorEntry = new SensorData(data);
        await sensorEntry.save();
        console.log('ข้อมูลถูกเพิ่มเข้า Database เรียบร้อยแล้ว');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล:', error);
    }
}

function parseFormatData(data) {
    return {
        device_id: data.device_id,
        timestamp: data.timestamp,
        status: data.status,
        sensors: {
            co: data.co,
            pm25: data.pm25,
            co2: data.co2,
            temperature: data.temperature,
            humid: data.humid
        }
    }
}

const sensorData = {
    device_id: "1",
    timestamp: new Date(),
    status: { status: "offline" },
    sensors: {
        co: { unit: "ppm", value: 4.894159, quality: "Good" },
        pm25: { unit: "ug/m³", value: 7.181055, quality: "Good" },
        co2: { unit: "ppm", value: 241.9945, quality: "Good" },
        temperature: { unit: "*C", value: 26.3, quality: "Normal" },
        humid: { unit: "%", value: 67, quality: "Humid" }
    }
};

module.exports = {insertSensorData, parseFormatData}