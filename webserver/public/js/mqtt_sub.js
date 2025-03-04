let url = window.location.href
url = url.replace(/(http:\/\/|https:\/\/)/, '').replace(/\/\?.*/, '')
const ws = new WebSocket(`wss://${url}`);
const urlParams = new URLSearchParams(window.location.search);
let mode = urlParams.get('mode') || 'mqtt';
const gasQualityColors = {
    "Good": "green-600",
    "Normal": "lime-500",
    "Unhealthy": "yellow-500",
    "Very Unhealthy": "amber-600",
    "Poor": "orange-600",
    "Dangerous": "red-600",
}

const gasQualityTH = {
    "Good": "ดี",
    "Normal": "ปกติ",
    "Unhealthy": "ไม่ดีต่อสุขภาพ",
    "Very Unhealthy": "ไม่ดีต่อสุขภาพอย่างมาก",
    "Poor": "ย่ำแย่อย่างมาก",
    "Dangerous": "อันตราย"
}

const humidQualityColors = {
    'Too Dry': 'red-600',
    'Dry': 'yellow-500',
    'Normal': 'green-500',
    'Humid': 'sky-400',
    'Too Humid': 'blue-600'
}
const temperatureQualityColors = {
    'Very Cold': 'blue-600',
    'Cold': 'sky-500',
    'Cool': 'cyan-500',
    'Normal': 'green-500',
    'Hot': 'orange-500',
    'Very Hot': 'red-500',
}

let lastQualityStatus = '';  // ตัวแปรเก็บสถานะคุณภาพอากาศล่าสุด
async function gasAlarm(type, quality) {
    if (quality === lastQualityStatus) {
        return;  // ถ้าเหมือนเดิมให้ข้ามไป ไม่ทำงาน
    }
    if (['Unhealthy', 'Very Unhealthy', 'Poor', 'Dangerous'].includes(quality)) {
        let typeTH = '';
        switch (type) {
            case 'pm25':
                typeTH = 'PM 2.5';
                break;
            case 'co2':
                typeTH = 'คาร์บอนไดออกไซด์';
                break;
            case 'co':
                typeTH = 'คาร์บอนมอนนอกไซด์';
                break;
        }
        const qualityTH = gasQualityTH[quality];
        const text = `${typeTH} อยู่ในระดับ${qualityTH}`;
        // สร้างการแจ้งเตือนในเบราว์เซอร์
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('แจ้งเตือนคุณภาพอากาศ', {
                body: text,
                icon: 'icon-url.png',
            });
        }
        // เล่นเสียงแจ้งเตือน
        await convertTextToSpeech(text);
        // เก็บสถานะคุณภาพอากาศล่าสุด
        lastQualityStatus = quality;
    }
}

const speechQueue = [];
let isPlaying = false;
let isMuted = false; // ตัวแปรเก็บสถานะเปิด/ปิดเสียง
let currentAudio = null; // เก็บออบเจ็กต์ Audio ปัจจุบัน

// ฟังก์ชันเปิด/ปิดเสียง
function toggleMute(button) {
    isMuted = !isMuted;
    button.textContent = isMuted ? '🔇 เปิดเสียง' : '🔊 ปิดเสียง';
    

    // หยุดเสียงทันทีหากกดปิดเสียง
    if (isMuted && currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        speechQueue.length = 0; // ล้างคิวเสียงทั้งหมด
        isPlaying = false;
    }
}

async function convertTextToSpeech(text) {
    if (text.trim() === '' || isMuted) {
        return;
    }

    // เพิ่มข้อความเข้า Queue
    speechQueue.push(text);

    // ถ้ายังไม่มีเสียงที่กำลังเล่นอยู่ ให้เริ่มเล่น
    if (!isPlaying) {
        playNextInQueue();
    }
}

async function playNextInQueue() {
    if (speechQueue.length === 0 || isMuted) {
        isPlaying = false;
        return;
    }

    isPlaying = true;
    const text = speechQueue.shift(); // ดึงข้อความแรกออกจากคิว

    try {
        const response = await fetch('/convert-text-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (response.ok) {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            currentAudio = audio; // เก็บอ้างอิงเสียงปัจจุบัน

            // รอให้เสียงเล่นจบก่อนค่อยเล่นข้อความถัดไป
            audio.onended = () => {
                currentAudio = null;
                playNextInQueue();
            };

            audio.play();
        } else {
            console.error('เกิดข้อผิดพลาดในการแปลงข้อความ');
            playNextInQueue();
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
        playNextInQueue();
    }
}

function adjustClassColor(element, label, defineLabelColors, needClass = 'text') {
    let ClassList = Array.from(element.classList)
    const colorClass = defineLabelColors[label]
    if (colorClass) {
        const newClass = `${needClass}-${colorClass}`
        ClassList.pop()
        ClassList.push(newClass)
        element.classList = ''
        ClassList.forEach(c => {
            element.classList.add(c)
        })
    }
}

function changeBgColor(element, newBgClass) {
    element.classList.forEach(cls => {
        if (/^bg-[a-z]+-\d+$/.test(cls)) {
            element.classList.remove(cls);
        }
    });
    element.classList.add(newBgClass);
}

const cardContainer = document.getElementById('card-container')
document.addEventListener('DOMContentLoaded', () => {
    const searchBluetoothContainer = document.getElementById('searchBluetoothContainer')
    if (mode == 'mqtt') {
        ws.onopen = () => {
            console.log("Connected to WebSocket Server");
        };
        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            let dataObj = {}
            dataObj[data.header] = data.value
            dataObj['timestamp'] = new Date()
            // console.log(data)
            // console.log(dataObj)
            updateElement(dataObj)
        };
        ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
        };
        ws.onclose = (error => {
            alert('เว็บไซต์ขาดการเชื่อมต่อกับ Server กรุณาลองใหม่อีกครั้ง')
            window.location.reload()
        })
    } else if (mode == 'bluetooth') {
        searchBluetoothContainer.classList.toggle('hidden')
    }

})

const lastestUpdateSpan = document.getElementById('lastestUpdate')
let pm25Value
let co2Value
let coValue
async function updateElement(data) {
    for (const [key, valueData] of Object.entries(data)) {
        if (key != 'timestamp') {
            const card = cardContainer.querySelector(`#${key}Card`)
            if (card) {
                if (data.pm25) pm25Value = data.pm25.value
                if (data.co2) co2Value = data.co2.value
                if (data.co) coValue = data.co.value
                const timestamp = new Date(data.timestamp).toLocaleString('th-TH')
                lastestUpdateSpan.innerText = timestamp
                const value = card.querySelector('[name="value"]')
                const unit = card.querySelector('[name="unit"]')
                const quality = card.querySelector('[name="quality"]')
                const updatedTime = card.querySelector('[name="updatedTime"]')
                value.innerHTML = (valueData.value)
                unit.innerHTML = (valueData.unit)
                quality.innerHTML = (valueData.quality)
                updatedTime.innerHTML = (timestamp)
                await gasAlarm(key, valueData.quality)
                const aqi = calOverallAQI(pm25Value, co2Value, coValue)
                updateQualityOverall(aqi)
                if (key == 'humid') {
                    adjustClassColor(quality, valueData.quality, humidQualityColors, 'text')
                    adjustClassColor(card, valueData.quality, humidQualityColors, 'border')
                } else {
                    adjustClassColor(quality, valueData.quality, gasQualityColors, 'text')
                    adjustClassColor(card, valueData.quality, gasQualityColors, 'border')
                }
            }
        }
    }
}

function updateQualityOverall(aqi) {
    if (aqi) {
        const overallElement = document.getElementById('QualityOverall')
        const aqiElement = overallElement.querySelector('#AQIValue')
        const aqiEmojiElement = overallElement.querySelector('#AQIEmoji')
        const aqiQualityElement = overallElement.querySelector('#AQIQuality')
        aqiElement.innerText = `AQI: ${aqi.toFixed(2)}`
        if (aqi <= 50) {
            changeBgColor(overallElement, 'bg-green-500')
            aqiEmojiElement.innerText = '😀'
            aqiQualityElement.innerText = `ดีมาก อากาศสะอาดไม่มีผลกระทบต่อสุขภาพ`
        } else if (aqi <= 100) {
            changeBgColor(overallElement, 'bg-lime-500')
            aqiEmojiElement.innerText = '😐'
            aqiQualityElement.innerText = `ปานกลาง เริ่มมีผลกระทบกับกลุ่มเสี่ยง (ผู้สูงอายุ, เด็ก, คนเป็นโรคปอด)`
        } else if (aqi <= 150) {
            changeBgColor(overallElement, 'bg-orange-500')
            aqiEmojiElement.innerText = '🫤'
            aqiQualityElement.innerText = `เริ่มไม่ดี ผู้เป็นโรคทางเดินหายใจอาจเริ่มมีอาการ`
        } else if (aqi <= 200) {
            changeBgColor(overallElement, 'bg-red-500')
            aqiEmojiElement.innerText = '😢'
            aqiQualityElement.innerText = `ไม่ดี ทุกคนเริ่มได้รับผลกระทบ หายใจลำบาก`

        } else if (aqi <= 300) {
            changeBgColor(overallElement, 'bg-violet-500')
            aqiEmojiElement.innerText = '😭'
            aqiQualityElement.innerText = `แย่มาก อาจเกิดผลกระทบต่อสุขภาพอย่างรุยแรง`

        } else {
            changeBgColor(overallElement, 'bg-stone-950')
            aqiEmojiElement.innerText = '💀'
            aqiQualityElement.innerText = `อันตราย เป็นอันตรายต่อสุขภาพในทุกกลุ่ม`

        }

    }
}

function calOverallAQI(pm25Value, co2Value, coValue) {
    if (pm25Value && co2Value && coValue) {
        const aqiPM25 = (pm25Value / 50) * 100
        const aqico2 = ((co2Value - 400) / 600) * 100
        const aqico = (coValue / 10) * 100
        const aqiOverall = (0.5 * aqiPM25) + (0.3 * aqico2) + (0.2 * aqico)
        return aqiOverall
    }
}

async function requestNotificationPermission() {
    // ตรวจสอบว่าเบราว์เซอร์รองรับการแจ้งเตือนหรือไม่
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('User granted notification permission');
            } else {
                console.log('User denied notification permission');
            }
        } else if (Notification.permission === 'granted') {
            // ถ้าได้รับการอนุญาตแล้ว
            console.log('Permission already granted');
        } else {
            console.log('Notification permission denied');
        }
    } else {
        console.log('Notifications not supported in this browser');
    }
}

function showNotification(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else {
        console.log('Permission for notifications is not granted');
    }
}

document.getElementById('notifyButton').addEventListener('click', async () => {
    await requestNotificationPermission();
    showNotification('แจ้งเตือน!', 'คุณภาพอากาศไม่ดี');
});

document.getElementById('selectMode').addEventListener('change', (e) => {
    const newMode = e.target.value;
    const newUrl = `${window.location.pathname}?mode=${newMode}`;
    window.history.pushState({}, '', newUrl);
    location.reload()
})

let bleDevice;
let bleServer;
let bleService;
let bleCharacteristic;
const SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0"
const CHARACTERISTIC_UUID = "abcdef01-1234-5678-1234-56789abcdef0"
async function connectBLE() {
    const bluetoothStatusElement = document.getElementById('bluetoothDeviceStatus')
    const bluetoothNameElement = document.getElementById('bluetoothDeviceName')
    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });
        bleServer = await bleDevice.gatt.connect();
        bleService = await bleServer.getPrimaryService(SERVICE_UUID);
        bleCharacteristic = await bleService.getCharacteristic(CHARACTERISTIC_UUID);
        bleCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            // update ค่าใน element
            const decoder = new TextDecoder('utf-8');
            let dataObj = decoder.decode(event.target.value);
            dataObj = JSON.parse(dataObj)
            dataObj['timestamp'] = new Date()
            // console.log("Received JSON: ", dataObj);
            updateElement(dataObj)
        });
        await bleCharacteristic.startNotifications();
        alert(`เชื่อมต่อกับอุปกรณ์ ${bleDevice.name} สำเร็จ`)
        bluetoothStatusElement.classList.remove('hidden')
        bluetoothStatusElement.classList.add('inline')
        bluetoothStatusElement.classList.remove('bg-red-100')
        bluetoothStatusElement.classList.add('bg-green-100')
        bluetoothNameElement.innerText = `${bleDevice.name} สำเร็จ✅`
        console.log(`name:${bleDevice.name} id:${bleDevice.id} Connected and listening for BLE data...`);
    } catch (error) {
        alert(`เชื่อมต่อกับอุปกรณ์ ${bleDevice.name} ไม่สำเร็จ ${error.toString()}`)
        bluetoothStatusElement.classList.remove('hidden')
        bluetoothStatusElement.classList.add('inline')
        bluetoothStatusElement.classList.remove('bg-green-100')
        bluetoothStatusElement.classList.add('bg-red-100')
        bluetoothNameElement.innerText = `${bleDevice.name} ไม่สำเร็จ❌`
        console.error("BLE Connection Error: ", error);
    }
}

async function sendDataToBLE(data) {
    if (!bleCharacteristic) {
        console.error("ยังไม่ได้เชื่อมต่อกับ BLE Device");
        return;
    }
    const encoder = new TextEncoder();
    await bleCharacteristic.writeValue(encoder.encode(data));
    console.log(`ส่งข้อมูลไปยัง BLE Device: ${data}`);
}

async function sendDataToBLENoRes(data) {
    if (!bleCharacteristic) {
        console.error("ยังไม่ได้เชื่อมต่อกับ BLE Device");
        return;
    }
    try {
        const encoder = new TextEncoder();
        await bleCharacteristic.writeValueWithoutResponse(encoder.encode(data)); // ใช้ WithoutResponse
        console.log(`📤 ส่งข้อมูลไปยัง BLE Device: ${data}`);
    } catch (error) {
        console.error("❌ ส่งข้อมูลไม่สำเร็จ:", error);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    selectMode.value = mode;
})