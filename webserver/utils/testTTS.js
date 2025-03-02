const googleTTS = require('google-tts-api');
const fs = require('fs');
const axios = require('axios');

const text = "สวัสดีครับ! นี่คือเสียงจาก Google TTS";
const url = googleTTS.getAudioUrl(text, { lang: 'th', slow: false });

axios({ url, responseType: 'arraybuffer' }).then((res) => {
    fs.writeFileSync('output.mp3', res.data);  // บันทึกไฟล์เสียงเป็น .mp3
    console.log("✅ บันทึกไฟล์เสียง 'output.mp3' สำเร็จ!");
}).catch(err => console.error("❌ เกิดข้อผิดพลาด:", err));
