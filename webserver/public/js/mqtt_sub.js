const ws = new WebSocket("ws://localhost:3000");

ws.onopen = () => {
    console.log("Connected to WebSocket Server");
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Received Data:", data);
    // แสดงข้อมูลใน HTML
    // document.getElementById("data").innerText = `Topic: ${data.topic}, Value: ${data.value}`;
};

ws.onerror = (error) => {
    console.error("WebSocket Error:", error);
};