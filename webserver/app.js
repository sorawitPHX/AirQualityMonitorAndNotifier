const express = require('express')
const fs = require('fs')
const path = require('path')
const http = require('http')
const mqtt = require('mqtt')
const WebSocket = require('ws')

const PORT = 3000
const mqtt_broker = 'mqtt://broker.mqtt.cool'

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })


const mqttClient = mqtt.connect(mqtt_broker, {
    clientId: 'AirQualityMonitorAndNotifier'
})

mqttClient.on('connect', () => {
    try {
        console.log(`Connected to mqtt ${mqtt_broker}`)
        mqttClient.subscribe("airqualitynotifyer/1/#");
    } catch (error) {
        console.error(error)
    }
})

mqttClient.on('message', (topic, message) => {
    try {
        const data = {
            topic,
            value: JSON.parse(message.toString())
        }
        console.log(new Date().toISOString(), data)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                console.log('WS has been send!!')
            }
        });
    } catch (error) {
        console.error(error)
    }
})

wss.on('connection', ws => {
    console.log(`${ws.readyState} Client Connected to WebSocket`);
    ws.send(JSON.stringify({ message: "Connected to WebSocket Server" }));
});

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, 'node_modules', 'mqtt', 'dist')))
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'index.html'))
})

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})