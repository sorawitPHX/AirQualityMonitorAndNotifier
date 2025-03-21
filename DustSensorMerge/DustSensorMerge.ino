#include <array>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_I2CDevice.h>
#include <Adafruit_GrayOLED.h>
#include <Adafruit_SPITFT.h>
#include <Adafruit_SPITFT_Macros.h>
#include <gfxfont.h>
#include <Adafruit_SSD1306.h>
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define OLED_RESET 4
#define MQTT_MAX_PACKET_SIZE 512
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire,OLED_RESET);

const int DELAY_LOOP_MS = 5; // change to slow down how often to read

using namespace std;

// WiFi
const char* ssid = "sorawitph";
const char* password = "12345678";

// MQTT
const char* mqtt_server = "broker.mqtt.cool";
const int mqtt_port = 1883;
const String device_id = "1";
const String mqtt_path = "airqualitynotifyer/" + device_id + "/data";
const String mqtt_path_pm25 = "airqualitynotifyer/" + device_id + "/pm25";
const String mqtt_path_co2 = "airqualitynotifyer/" + device_id + "/co2";
const String mqtt_path_co = "airqualitynotifyer/" + device_id + "/co";
const String mqtt_path_temperature = "airqualitynotifyer/" + device_id + "/temperature";
const String mqtt_path_humid = "airqualitynotifyer/" + device_id + "/humid";
String clientID = "ESP32_Client_" + String(random(1000, 9999));
WiFiClient espClient;
PubSubClient client(espClient);

int dustMeasurePin = 34;
int dustLedPower = 2;
int MQ7Pin = 35;
int MQ135Pin = 32;
int DHT11Pin = 19;
int DHTType = DHT11;
int sdaPin = 21;
int sclPin = 22;

// Global config
float esp32Voltage = 3.3;
float esp32AnalogLevel = 4095.0;
unsigned long int previosLedBlink = 0;

// Dust Sensor
int samplingTime = 280;
int deltaTime = 40;
int sleepTime = 9680;
float voMeasured = 0;
float calcVoltage = 0;
float dustDensity = 0;

// DHT config
DHT dht(DHT11Pin, DHTType);

void ledBlink(int ledPin, unsigned long int& previous, int intervalMilli = 500) {
  pinMode(ledPin, OUTPUT);
  if (millis() - previous >= intervalMilli) {
    previous = millis();
    int ledStatus = digitalRead(ledPin);
    digitalWrite(ledPin, !ledStatus);
  }
}

void setup_wifi() {
  delay(10);
  // Connect to Wi-Fi network
  WiFi.begin(ssid, password);
  Serial.printf("Connecting to the %s ...", ssid);
}

void reconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi หลุด! กำลังเชื่อมใหม่...");
    WiFi.begin(ssid, password);
  } else {
    Serial.println("WiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  }
}

void callback(char* topic, byte* message, unsigned int length) {
  // ตัวอย่างของการรับข้อมูลจาก MQTT (สามารถใช้พิมพ์ค่าที่ได้รับมาได้)
  Serial.print("Message arrived on topic: ");
  Serial.print(topic);
  Serial.print(". Message: ");
  for (int i = 0; i < length; i++) {
    Serial.print((char)message[i]);
  }
  Serial.println();
}

void reconnectMQTT() {
  static unsigned long lastAttempt = 0;
  unsigned long now = millis();

  // ลองเชื่อมต่อใหม่ทุก 5 วินาที
  if (now - lastAttempt > 5000) {
    lastAttempt = now;
    Serial.println("กำลังเชื่อมต่อ MQTT...");
    if (client.connect(clientID.c_str())) {
      Serial.println("MQTT เชื่อมต่อสำเร็จ!");
      client.subscribe("test/topic");
    } else {
      Serial.print("MQTT เชื่อมต่อไม่สำเร็จ! Error code: ");
      Serial.println(client.state());  // ดูโค้ดข้อผิดพลาด
    }
  }
}

float readDustSensor() {
  // หน่วย ug/m³
  digitalWrite(dustLedPower, LOW);
  delayMicroseconds(samplingTime);
  voMeasured = analogRead(dustMeasurePin);
  delayMicroseconds(deltaTime);
  digitalWrite(dustLedPower, HIGH);
  delayMicroseconds(sleepTime);
  calcVoltage = voMeasured * (3.3 / esp32AnalogLevel);
  dustDensity = 170 * calcVoltage - 0.1;
  return dustDensity;
}

float readMQ7() {
  // หน่วย ppm
  float rawValue = analogRead(MQ7Pin);
  float slope = -0.7516072988;
  float A = 45.87510694;
  float Rseries = 1000;
  float V_Rseries = ((float)rawValue * esp32Voltage) / esp32AnalogLevel;
  float Rs = ((esp32Voltage - V_Rseries) / V_Rseries) * Rseries;
  float R0 = 400;
  float Y = Rs / R0;
  float CO_ppm = pow(10, (log10(Y / A) / slope));
  return CO_ppm;
}

float readMQ135(String gasType) {
  // หน่วย ppm
  float rawValue = analogRead(MQ135Pin);
  // Serial.println(rawValue);
  float slope, A, R0, a, b;

  // กำหนดค่าสัมประสิทธิ์ตามชนิดของก๊าซที่ต้องการวัด
  // ค่าเหล่านี้อ้างอิงจากข้อมูลทางเทคนิคและการสอบเทียบเซ็นเซอร์ MQ-135
  gasType = "CO2";
  if (gasType == "NH3") {
    slope = -0.263;
    A = 0.585;
    R0 = 1800.0;
  } else if (gasType == "NOx") {
    slope = -0.245;
    A = 0.632;
    R0 = 1850.0;
  } else if (gasType == "CO2") {
    slope = -0.318;
    A = 0.711;
    R0 = 24743.0;
    a = 116.602;
    b = -2.769;
  } else if (gasType == "Benzene") {
    slope = -0.276;
    A = 0.652;
    R0 = 1820.0;
  } else if (gasType == "Smoke") {
    slope = -0.304;
    A = 0.693;
    R0 = 1760.0;
  } else if (gasType == "Alcohol") {
    slope = -0.292;
    A = 0.640;
    R0 = 1730.0;
  } else if (gasType == "Acetone") {
    slope = -0.2884453282;
    A = 2.720027932;
    R0 = 1809.52;
  } else if (gasType == "Toluene") {
    slope = -0.310;
    A = 0.765;
    R0 = 1840.0;
  } else if (gasType == "Formaldehyde") {
    slope = -0.268;
    A = 0.690;
    R0 = 1780.0;
  } else {
    // ค่าเริ่มต้นหากไม่ระบุชนิดของก๊าซ
    slope = -0.318;
    A = 0.711;
    R0 = 24743.0;
    a = 116.602;
    b = -2.769;  // ใช้ค่า CO2 เป็นค่าเริ่มต้น
  }

  float R = 2000;
  float V_Rseries = ((float)rawValue * esp32Voltage) / esp32AnalogLevel;
  float Rs = ((esp32AnalogLevel * R) / rawValue) - R;
  float Y = Rs / R0;
  // Serial.println(Rs);
  float gasConcentration = a * pow(Y, b);
  return gasConcentration;
}

array<float, 2> readDHT11() {
  static unsigned long previosDHT11 = 0;
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();  // ใช้ Celsius เป็นค่าเริ่มต้น
  // ตรวจสอบว่าการอ่านค่ามีความถูกต้องหรือไม่
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    return { -1, -1 };
  }
  return { humidity, temperature };
}

String checkQualityPM25(float value) {
  if (value <= 30) {
    return "Good";
  } else if (value <= 60) {
    return "Normal";
  } else if (value <= 90) {
    return "Unhealthy";
  } else if (value <= 120) {
    return "Very Unhealthy";
  } else if (value <= 250) {
    return "Poor";
  } else {
    return "Dangerous";
  }
}

String checkQualityCO2(float value) {
  if (value <= 400) {
    return "Good";
  } else if (value <= 1000) {
    return "Normal";
  } else if (value <= 2000) {
    return "Unhealthy";
  } else if (value <= 5000) {
    return "Very Unhealthy";
  } else if (value <= 50000) {
    return "Poor";
  } else {
    return "Dangerous";
  }
}

String checkQualityCO(float value) {
  if (value <= 35) {
    return "Good";
  } else if (value <= 100) {
    return "Normal";
  } else if (value <= 200) {
    return "Unhealthy";
  } else if (value <= 400) {
    return "Very Unhealthy";
  } else if (value <= 800) {
    return "Poor";
  } else {
    return "Dangerous";
  }
}

String checkLevelTemperature(float value) {
  return "High";
}

String checkLevelHumid(float value) {
  return "High";
}


void setup() {
  Serial.begin(9600);
  pinMode(dustLedPower, OUTPUT);
  pinMode(dustMeasurePin, INPUT);
  pinMode(MQ7Pin, INPUT);
  pinMode(MQ135Pin, INPUT);
  pinMode(DHT11Pin, INPUT);

  dht.begin();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // SSD1306_SWITCHCAPVCC = generate display voltage from 3.3V internally
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3c)) { // Address 0x3D for 128x64
    Serial.println(F("SSD1306 allocation failed"));
    for (;;); // Don't proceed, loop forever
  }
  
  // Clear the buffer
  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(WHITE, BLACK);
  display.setCursor(0, 0);
  display.println("Screen initialized!");
  display.display();
  delay(500);
  display.clearDisplay();
}

void printOLED(
    float pm25Value, 
    String pm25Quality, 
    float coValue, 
    String coQuality, 
    float co2Value, 
    String co2Quality, 
    float humidity, 
    float temp
  ) {
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.printf("PM2.5: %.2f ug/m3", pm25Value);
  display.println();
  display.printf("Status: %s", pm25Quality.c_str());
  display.println();
  display.printf("CO: %.2f ppm => %s", coValue, coQuality.c_str());
  display.println();
  display.printf("CO2: %.2f ppm => %s", co2Value, co2Quality.c_str());
  display.println();
  display.printf("Humid: %.2f % && Temp: %.2f *C", humidity, temp);
}

void loop() {
  // ✅ ใช้ client.loop() เพื่อให้ MQTT ทำงานต่อเนื่อง (แต่ไม่บล็อก)
  float pm25Value = readDustSensor();
  float co2Value = readMQ135("CO2");
  float coValue = readMQ7();
  array<float, 2> dhtValue = readDHT11();
  String pm25Quality = checkQualityPM25(pm25Value);
  String co2Quality = checkQualityCO2(co2Value);
  String coQuality = checkQualityCO(coValue);
  // String humidLevel = checkLevelHumid(dhtValue[0]);
  // String temperatureLevel = checkLevelTemperature(dhtValue[1]);
  Serial.printf("ค่าฝุ่น: %.2f ug/m³ %s | ", pm25Value, pm25Quality.c_str());
  Serial.printf("ค่า CO: %.2f ppm %s | ", coValue, coQuality.c_str());
  Serial.printf("ค่า CO2: %.2f ppm %s | ", co2Value, co2Quality.c_str());
  Serial.printf("ค่า Humid: %.2f % ค่า Temp: %.2f *C\n", dhtValue[0], dhtValue[1]);

  // Clear the display on each frame. We draw from the _circularBuffer
  display.clearDisplay();

  // erase status bar by drawing all black
  display.fillRect(0, 0, display.width(), 8, SSD1306_BLACK);

  // print all value to OLED
  printOLED(pm25Value, pm25Quality, coValue, coQuality, co2Value, co2Quality, dhtValue[0], dhtValue[1]);

  display.display();

  delay(DELAY_LOOP_MS);
  
  // สร้าง JSON
  StaticJsonDocument<256> jsonDoc;
  StaticJsonDocument<256> pm25Doc;
  StaticJsonDocument<256> co2Doc;
  StaticJsonDocument<256> coDoc;
  StaticJsonDocument<256> humidDoc;
  StaticJsonDocument<256> temperatureDoc;

  // ใส่ค่าฝุ่น PM2.5
  pm25Doc["unit"] = "ug/m³";
  pm25Doc["value"] = pm25Value;
  pm25Doc["quality"] = pm25Quality;

  // ใส่ค่า CO2
  co2Doc["unit"] = "ppm";
  co2Doc["value"] = co2Value;
  co2Doc["quality"] = co2Quality;

  // ใส่ค่า CO
  coDoc["unit"] = "ppm";
  coDoc["value"] = coValue;
  coDoc["quality"] = coQuality;

  // ใส่ค่า Humidity
  humidDoc["unit"] = "%";
  humidDoc["value"] = dhtValue[0];

  // ใส่ค่า Temperature
  temperatureDoc["unit"] = "*C";
  temperatureDoc["value"] = dhtValue[1];


  // แปลง JSON เป็น String
  char jsonStr[256];
  size_t jsonSize;
  bool success;


  if (WiFi.status() != WL_CONNECTED) {
    reconnectWiFi();
  } else {
    jsonSize = serializeJson(pm25Doc, jsonStr);
    if (!client.publish(mqtt_path_pm25.c_str(), jsonStr, jsonSize)) { Serial.println("❌ Publish pm2.5 failed!"); }
    jsonSize = serializeJson(co2Doc, jsonStr);
    if (!client.publish(mqtt_path_co2.c_str(), jsonStr, jsonSize)) { Serial.println("❌ Publish co2 failed!"); }
    jsonSize = serializeJson(coDoc, jsonStr);
    if (!client.publish(mqtt_path_co.c_str(), jsonStr, jsonSize)) { Serial.println("❌ Publish co failed!"); }
    jsonSize = serializeJson(temperatureDoc, jsonStr);
    if (!client.publish(mqtt_path_temperature.c_str(), jsonStr, jsonSize)) { Serial.println("❌ Publish temperature failed!"); }
    jsonSize = serializeJson(humidDoc, jsonStr);
    if (!client.publish(mqtt_path_humid.c_str(), jsonStr, jsonSize)) { Serial.println("❌ Publish humid failed!"); }
  }
  // ✅ ตรวจสอบและเชื่อมต่อ MQTT ใหม่ถ้าหลุด (ไม่บล็อก)
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  delay(2000);
}
