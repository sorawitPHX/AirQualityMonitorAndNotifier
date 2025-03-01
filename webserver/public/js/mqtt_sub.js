const ws = new WebSocket("ws://localhost:3000");
const gasQualityColors = {
    "Good": "green-600",
    "Normal": "lime-500",
    "Unhealthy": "yellow-500",
    "Very Unhealthy": "amber-600",
    "Poor": "orange-600",
    "Dangerous": "red-600",
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

window.speechSynthesis.onvoiceschanged = () => {
    const voices = window.speechSynthesis.getVoices();
    console.log(voices.map(v => `${v.name} (${v.lang})`));
};

const speak = (text, lang = "en-US") => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    // หาเสียงที่เหมาะสม
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.lang === lang);

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    } else {
        console.warn("No suitable voice found for", lang);
    }

    speechSynthesis.speak(utterance);
};


function adjustClassColor(element, label, defineLabelColors, needClass='text') {
    let ClassList = Array.from(element.classList)
    const colorClass = defineLabelColors[label]
    if(colorClass) {
        const newClass = `${needClass}-${colorClass}`
        ClassList.pop()
        ClassList.push(newClass)
        element.classList = ''
        ClassList.forEach(c=>{
            element.classList.add(c)
        })
    }
}

document.addEventListener('DOMContentLoaded', ()=>{
    const cardContainer = document.getElementById('card-container')
    ws.onopen = () => {
        console.log("Connected to WebSocket Server");
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received Data:", data);
        const card = cardContainer.querySelector(`#${data.header}Card`)
        // console.log(card)
        if(card) {
            const value = card.querySelector('[name="value"]')
            const unit = card.querySelector('[name="unit"]')
            const quality = card.querySelector('[name="quality"]')
            value.innerHTML = (data.value.value)
            unit.innerHTML = (data.value.unit)
            quality.innerHTML = (data.value.quality)
            if(data.header == 'humid') {
                adjustClassColor(quality, data.value.quality, humidQualityColors, 'text')
                adjustClassColor(card, data.value.quality, humidQualityColors, 'border')
            }else {
                adjustClassColor(quality, data.value.quality, gasQualityColors, 'text')
                adjustClassColor(card, data.value.quality, gasQualityColors, 'border')
            }
        }
    };
    
    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };
})
