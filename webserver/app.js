const express = require('express')
const fs = require('fs')
const path = require('path')
const http = require('http')
const mqtt = require('mqtt')
const WebSocket = require('ws')
const googleTTS = require('google-tts-api')
const axios = require('axios')

const PORT = process.env.PORT || 4001; // ใช้ process.env.PORT จาก cPanel
const mqtt_broker = 'mqtt://broker.mqtt.cool'

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })


const mqttClient = mqtt.connect(mqtt_broker, {
    clientId: 'AirQualityMonitorAndNotifier'
})

mqttClient.on('connect', () => {
    try {
        console.log(`Connected to mqtt ${mqtt_broker} ${new Date().toISOString()}`)
        mqttClient.subscribe("airqualitynotifyer/1/#");
    } catch (error) {
        console.error(error)
    }
})

mqttClient.on('message', (topic, message) => {
    try {
        const header = topic.split('/').slice(-1)[0]
        const data = {
            header: header,
            value: JSON.parse(message.toString()),
            timestamp: new Date()
        }
        // console.log(new Date().toISOString(), data)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                // console.log('WS has been send!!')
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
app.use('/mqtt', express.static(path.join(__dirname, 'node_modules', 'mqtt', 'dist')))
app.use('/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font')))
app.use('/flowbite', express.static(path.join(__dirname, 'node_modules', 'flowbite', 'dist')))
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