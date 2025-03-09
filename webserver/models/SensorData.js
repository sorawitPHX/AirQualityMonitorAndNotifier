const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
    unit: String,
    value: Number,
    quality: String
}, { _id: false });

const sensorDataSchema = new mongoose.Schema({
    device_id: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: {
        status: String
    },
    sensors: {
        co: sensorSchema,
        pm25: sensorSchema,
        co2: sensorSchema,
        temperature: sensorSchema,
        humid: sensorSchema
    }
});

const SensorData = mongoose.model('SensorData', sensorDataSchema);
module.exports = SensorData;