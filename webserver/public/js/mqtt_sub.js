const ws = new WebSocket("ws://localhost:3000");

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
    "Poor": "ย่ำแต่",
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
    'Cold': '',
    'Cool': '',
    'Normal': '',
    'Hot': '',
    'Very Hot': '',
}

let lastQualityStatus = '';  // ตัวแปรเก็บสถานะคุณภาพอากาศล่าสุด

async function gasAlarm(type, quality) {
    if (quality === lastQualityStatus) {
        return;  // ถ้าเหมือนเดิมให้ข้ามไป ไม่ทำงาน
    }

    if (quality === 'Unhealthy') {
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
        const text = `${typeTH} คุณภาพอากาศอยู่ในระดับ${qualityTH}`;

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

async function convertTextToSpeech(text) {
    if (text.trim() === '') {
        console.error('กรุณากรอกข้อความ');
        return;
    }

    try {
        const response = await fetch('/convert-text-to-speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (response.ok) {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            // สร้าง Audio element เพื่อเล่นเสียง
            const audio = new Audio(audioUrl);
            audio.play();  // เล่นเสียงทันทีหลังจากที่ได้รับไฟล์เสียง

        } else {
            console.error('เกิดข้อผิดพลาดในการแปลงข้อความ');
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
        alert('ไม่สามารถติดต่อกับเซิร์ฟเวอร์ได้');
    }
}


window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    console.log(voices.map(v => `${v.name} (${v.lang})`));
};


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

document.addEventListener('DOMContentLoaded', () => {
    const cardContainer = document.getElementById('card-container')
    ws.onopen = () => {
        console.log("Connected to WebSocket Server");
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const card = cardContainer.querySelector(`#${data.header}Card`)
        if (card) {
            const value = card.querySelector('[name="value"]')
            const unit = card.querySelector('[name="unit"]')
            const quality = card.querySelector('[name="quality"]')
            const updatedTime = card.querySelector('[name="updatedTime"]')
            value.innerHTML = (data.value.value)
            unit.innerHTML = (data.value.unit)
            quality.innerHTML = (data.value.quality)
            updatedTime.innerHTML = (new Date(data.timestamp).toLocaleString('th-TH'))
            await gasAlarm(data.header, data.value.quality)
            if (data.header == 'humid') {
                adjustClassColor(quality, data.value.quality, humidQualityColors, 'text')
                adjustClassColor(card, data.value.quality, humidQualityColors, 'border')
            } else {
                adjustClassColor(quality, data.value.quality, gasQualityColors, 'text')
                adjustClassColor(card, data.value.quality, gasQualityColors, 'border')
            }
        }
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };
})

// ฟังก์ชันขอสิทธิ์การแจ้งเตือน
async function requestNotificationPermission() {
    // ตรวจสอบว่าเบราว์เซอร์รองรับการแจ้งเตือนหรือไม่
    if ('Notification' in window) {
        // ตรวจสอบสถานะการอนุญาตการแจ้งเตือน
        if (Notification.permission === 'default') {
            // ถ้ายังไม่ได้ขอสิทธิ์จะทำการขอสิทธิ์
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

// ฟังก์ชันสำหรับแสดงการแจ้งเตือน
function showNotification(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else {
        console.log('Permission for notifications is not granted');
    }
}

// ตัวอย่างการเรียกใช้
document.getElementById('notifyButton').addEventListener('click', async () => {
    // ขอสิทธิ์การแจ้งเตือน
    await requestNotificationPermission();

    // แสดงการแจ้งเตือนหลังจากที่ได้รับสิทธิ์
    showNotification('แจ้งเตือน!', 'คุณภาพอากาศไม่ดี');
});