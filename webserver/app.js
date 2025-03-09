require('dotenv').config()
const express = require('express')
const fs = require('fs')
const path = require('path')
const http = require('http')
const mqtt = require('mqtt')
const WebSocket = require('ws')
const googleTTS = require('google-tts-api')
const axios = require('axios')
const mongoose = require('mongoose')

const PORT = process.env.PORT || 4001; // ใช้ process.env.PORT จาก cPanel
const mqtt_broker = 'mqtt://broker.mqtt.cool'

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const MONGO_URI = process.env.MONGO_URI
const { insertSensorData, parseFormatData } = require('./utils/SensorDataHandle')
mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));
mongoose.connect(MONGO_URI).then(result=>{
    console.log('Mongo has been connected✅')
}).catch(err=>{
    console.error(err)
})

const device_id = '1'
const mqttPath = `airqualitynotifyer/${device_id}/`
const mqttClient = mqtt.connect(mqtt_broker, {
    clientId: `AirQualityMonitorAndNotifier_${Math.floor(Math.random() * 10E6)}`,
    clean: true, 
    keepalive: 60,
})
mqttClient.on('connect', (e) => {
    try {
        mqttClient.subscribe(`${mqttPath}#`);
    } catch (error) {
        console.error(error)
    }
})
let dataHeader = []
let completeDataHeader = false
let data = {}
let readyToSend = false
let previous = Date.now()
mqttClient.on('message', async (topic, message) => {
    try {
        const header = topic.split('/').slice(-1)[0]
        const data_message = JSON.parse(message)
        data[header] = data_message
        data['timestamp'] = new Date()
        data['device_id'] = device_id
        readyToSend = false
        completeDataHeader = true
        if (!dataHeader.includes(header)) {
            dataHeader.push(header)
            completeDataHeader = false
        }
        if(completeDataHeader) {
            dataHeader = []
            console.clear()
            readyToSend = true
        }
        if (readyToSend) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
            // console.log(data)
            const SensorData = parseFormatData(data)
            await insertSensorData(SensorData)

            console.log('Took Time', Date.now() - previous, 'ms')
            previous = Date.now()
        }
    } catch (error) {
        console.error(error)
    }
})
mqttClient.on('close', () => {
    console.log('❌ MQTT Disconnected');
    mqttClient.unsubscribe("airqualitynotifyer/1/#", () => {
        console.log("Unsubscribed before reconnect");
    });
});
mqttClient.on('offline', () => {
    console.log("⚠️ MQTT Client is Offline");
});

mqttClient.on('reconnect', () => {
    console.log("🔄 MQTT Trying to Reconnect...");
});
mqttClient.on('error', (err) => {
    console.error("MQTT Error:", err.message);
});

wss.on('connection', ws => {
    // ws.send(JSON.stringify({ message: "Connected to WebSocket Server" }));
    ws.send(JSON.stringify(data));
    ws.on('message', message => {
        const data = JSON.parse(message)
        for (const [key, value] of Object.entries(data)) {
            mqttClient.publish(`${mqttPath}${key}`, JSON.stringify(value))
        }
        console.log('Data sent to MQTT')
    })
});


app.use(express.static(path.join(__dirname, 'public')))
app.use('/mqtt', express.static(path.join(__dirname, 'node_modules', 'mqtt', 'dist')))
app.use('/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font')))
app.use('/flowbite', express.static(path.join(__dirname, 'node_modules', 'flowbite', 'dist')))
app.use('/apexcharts', express.static(path.join(__dirname, 'node_modules', 'apexcharts', 'dist')))
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'))
})

app.post('/convert-text-to-speech', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).send("กรุณากรอกข้อความ");
    }
    const url = googleTTS.getAudioUrl(text, {
        lang: 'th',  // ภาษาไทย
        slow: false,  // ควบคุมความเร็วเสียง
    });

    try {
        const audioResponse = await axios({ url, responseType: 'arraybuffer' });
        res.set('Content-Type', 'audio/mp3');
        res.send(audioResponse.data);
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการแปลงข้อความ:', err);
        res.status(500).send('เกิดข้อผิดพลาดในการแปลงข้อความ');
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})