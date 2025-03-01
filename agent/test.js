const mqtt = require('mqtt');

const brokerUrl = "mqtt://broker.mqtt.cool";

// กำหนด Topics ที่ต้องการ subscribe
const topics = [
    "airqualitynotifyer/1/pm25",
    "airqualitynotifyer/1/co2",
    "airqualitynotifyer/1/co",
    "airqualitynotifyer/1/temperature",
    "airqualitynotifyer/1/humid"
];

const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
    console.log('Connected to MQTT Broker');

    // Subscribe หลาย topic พร้อมกัน
    client.subscribe(topics, (err, granted) => {
        if (err) {
            console.error('Subscribe failed:', err);
        } else {
            console.log('Subscribed to topics:', granted.map(g => g.topic));
        }
    });
});

// รับค่าข้อมูลเมื่อมีการส่งมาที่ topic ใดๆ ที่ subscribe ไว้
client.on('message', (topic, message) => {
    const objName = topic.split('/').slice(-1)

    const data = JSON.parse(message.toString())
    console.log(`${objName}:`, data);
    
});
