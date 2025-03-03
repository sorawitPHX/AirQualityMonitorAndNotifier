#include <Arduino.h>
#include <WiFiManager.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#define SERVICE_UUID "12345678-1234-5678-1234-56789abcdef0"
#define CHARACTERISTIC_UUID "abcdef01-1234-5678-1234-56789abcdef0"
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
#define SCREEN_WIDTH 128  // OLED display width, in pixels
#define SCREEN_HEIGHT 64  // OLED display height, in pixels
#define OLED_RESET 4
#define MQTT_MAX_PACKET_SIZE 512
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Wifi Manager
WiFiManager wm;

const int DELAY_LOOP_MS = 5;  // change to slow down how often to read

using namespace std;

// WiFi
const char* ssid = "sorawitph";
const char* password = "12345678";
String statusWifi = "Disconnected";

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

unsigned long previousMillis = 0;

// Variable of Each Sensor
float pm25Value;
float co2Value;
float coValue;
array<float, 2> dhtValue;
String pm25Quality;
String co2Quality;
String coQuality;
String humidLevel;
String tempLevel;

// DHT config
DHT dht(DHT11Pin, DHTType);

BLECharacteristic* sensorCharacteristic;
bool deviceConnected = false;
bool resetWiFi = false;  // ตัวแปรสำหรับตรวจจับคำสั่งรีเซ็ต
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    pServer->getAdvertising()->start();
  }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String value = pCharacteristic->getValue();
    Serial.print("Received via RAW: ");
    Serial.println(value);
    if (value.length() > 0) {
      Serial.print("Received via BLE: ");
      Serial.println(value);

      // ถ้าได้รับคำสั่ง "RESET_WIFI" ให้เคลียร์ค่า WiFi
      if (value.equals("RESET_WIFI")) {
        Serial.println("Resetting WiFi settings...");
        resetWiFi = true;
      }
    }
  }
};

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

void callback(char* topic, uint8_t* message, unsigned int length) {
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
  if (value <= 7.9) {
    return "Very Cold";
  } else if (value <= 15.9) {
    return "Cold";
  } else if (value <= 22.9) {
    return "Cool";
  } else if (value <= 34.9) {
    return "Normal";
  } else if (value <= 39.9) {
    return "Hot";
  } else {
    return "Very Hot";
  }
}

String checkLevelHumid(float value) {
  if (value < 20) {
    return "Too Dry";
  } else if (value < 40) {
    return "Dry";
  } else if (value < 60) {
    return "Normal";
  } else if (value < 80) {
    return "Humid";
  } else {
    return "Too Humid";
  }
}




void printOLED(
  float pm25Value,
  String pm25Quality,
  float coValue,
  String coQuality,
  float co2Value,
  String co2Quality,
  float humidity,
  String humidLevel,
  float temp,
  String tempLevel,
  String statusWifi) {

  static int displayState = 0;  // ใช้เก็บ state ของค่าที่กำลังแสดงผล
  const long interval = 5000;   // ระยะเวลาที่ต้องการหน่วง จักวิกะได้หรรมเอ้ย
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    displayState = (displayState + 1) % 5;
  }
  display.clearDisplay();

  switch (displayState) {
    case 0:  // แสดงค่า PM2.5
      displayData("PM2.5", pm25Value, pm25Quality);
      break;
    case 1:  // แสดงค่า CO
      displayData("CO", coValue, coQuality);
      break;
    case 2:  // แสดงค่า CO2
      displayData("CO2", co2Value, co2Quality);
      break;
    case 3:  // แสดงค่าความชื้น
      displayData("Humid.", humidity, humidLevel);
      break;
    case 4:  // แสดงค่าอุณหภูมิ
      displayData("Temp.", temp, tempLevel);
      break;
  }

  display.setCursor(0, 55);
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.print(statusWifi);

  display.display();
}

void displayData(String title, float value, String quality) {
  int16_t x1_value, y1_value;
  int16_t x1_header, y1_header;
  int16_t x1_unit, y1_unit;
  uint16_t w_value, h_value;
  uint16_t w_header, h_header;
  uint16_t w_unit, h_unit;

  display.setTextSize(2);

  // แสดงชื่อหัวข้อ
  display.getTextBounds(title, 0, 0, &x1_header, &y1_header, &w_header, &h_header);

  // draw sqaure all white
  display.fillRect(0, 0, display.width(), h_header, WHITE);

  display.setCursor((display.width() - w_header) / 2, 0);
  display.setTextColor(BLACK, WHITE);
  display.print(title);

  display.setTextSize(1);
  // แสดงค่าตัวเลข
  if (title == "PM2.5") {
    if (value < 10) {
      display.getTextBounds("X.XX ug/m3", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100) {
      display.getTextBounds("XX.XX ug/m3", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 1000) {
      display.getTextBounds("XXX.XX ug/m3", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    }
  } else if (title == "CO") {
    if (value < 10) {
      display.getTextBounds("X.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100) {
      display.getTextBounds("XX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 1000) {
      display.getTextBounds("XXX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    }
  } else if (title == "CO2") {
    if (value < 10) {
      display.getTextBounds("X.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100) {
      display.getTextBounds("XX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 1000) {
      display.getTextBounds("XXX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 10000) {
      display.getTextBounds("XXXX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100000) {
      display.getTextBounds("XXXXX.XX ppm", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    }
  } else if (title == "Humid.") {
    if (value < 10) {
      display.getTextBounds("X.XX %", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100) {
      display.getTextBounds("XX.XX %", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 1000) {
      display.getTextBounds("XXX.XX %", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    }
  } else if (title == "Temp.") {
    if (value < 10) {
      display.getTextBounds("X.XX *C", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 100) {
      display.getTextBounds("XX.XX *C", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    } else if (value < 1000) {
      display.getTextBounds("XXX.XX *C", 0, 0, &x1_value, &y1_value, &w_value, &h_value);
    }
  }

  display.setCursor((display.width() - w_value) / 2, display.height() - (display.height() - h_header) + 5);
  display.setTextColor(WHITE);
  if (title == "PM2.5") {
    display.printf("%.2f ug/m3", value);
  } else if (title == "CO") {
    display.printf("%.2f ppm", value);
  } else if (title == "CO2") {
    display.printf("%.2f ppm", value);
  } else if (title == "Humid.") {
    display.printf("%.2f %%", value);
  } else if (title == "Temp.") {
    display.printf("%.2f *C", value);
  }

  // แสดงระดับคุณภาพ
  if (title == "PM2.5") {
    if (value <= 30) {
      display.getTextBounds("Good", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 60) {
      display.getTextBounds("Normal", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 90) {
      display.getTextBounds("Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 120) {
      display.getTextBounds("Very Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 250) {
      display.getTextBounds("Poor", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else {
      display.getTextBounds("Dangerous", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    }
  } else if (title == "CO") {
    if (value <= 35) {
      display.getTextBounds("Good", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 100) {
      display.getTextBounds("Normal", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 200) {
      display.getTextBounds("Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 400) {
      display.getTextBounds("Very Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 800) {
      display.getTextBounds("Poor", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else {
      display.getTextBounds("Dangerous", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    }
  } else if (title == "CO2") {
    if (value <= 400) {
      display.getTextBounds("Good", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 1000) {
      display.getTextBounds("Normal", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 2000) {
      display.getTextBounds("Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 5000) {
      display.getTextBounds("Very Unhealthy", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 50000) {
      display.getTextBounds("Poor", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else {
      display.getTextBounds("Dangerous", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    }
  } else if (title == "Humid.") {
    if (value < 20) {
      display.getTextBounds("Too Dry", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value < 40) {
      display.getTextBounds("Dry", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value < 60) {
      display.getTextBounds("Normal", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value < 80) {
      display.getTextBounds("Humid", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else {
      display.getTextBounds("Too Humid", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    }
  } else if (title == "Temp.") {
    if (value <= 7.9) {
      display.getTextBounds("Very Cold", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 15.9) {
      display.getTextBounds("Cold", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 22.9) {
      display.getTextBounds("Cool", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 34.9) {
      display.getTextBounds("Normal", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else if (value <= 39.9) {
      display.getTextBounds("Hot", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    } else {
      display.getTextBounds("Very Hot", 0, 0, &x1_unit, &y1_unit, &w_unit, &h_unit);
    }
  }

  display.setCursor((display.width() - w_unit) / 2, display.height() - (display.height() - (h_value + h_header + 10)));
  display.setTextColor(WHITE);
  display.print(quality);
}

void setup() {
  Serial.begin(9600);
  pinMode(dustLedPower, OUTPUT);
  pinMode(dustMeasurePin, INPUT);
  pinMode(MQ7Pin, INPUT);
  pinMode(MQ135Pin, INPUT);
  pinMode(DHT11Pin, INPUT);

  dht.begin();

  // wm.resetSettings();
  // set esp as Access Point (AP)
  if (wm.autoConnect((String("AirQualityMonitorNotifier_") + device_id).c_str())) {
    Serial.println("");
    Serial.println("Connected already WiFi :) ");
    Serial.println("IP Address : ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("failed to connect and hit timeout");
    delay(1000);
    ESP.restart();
  }

  //setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // SSD1306_SWITCHCAPVCC = generate display voltage from 3.3V internally
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3c)) {  // Address 0x3D for 128x64
    Serial.println(F("SSD1306 allocation failed"));
    for (;;)
      ;  // Don't proceed, loop forever
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

  BLEDevice::init((String("AirQualityMonitorNotifier_") + device_id).c_str());
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  sensorCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY);
  BLECharacteristic* pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
  sensorCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("BLE Server Started");
}

void loop() {
  static unsigned long previousMainLoop = 0;
  // ถ้าพบคำสั่งให้รีเซ็ต WiFi
  //Serial.println(resetWiFi);
  if (resetWiFi) {
    display.clearDisplay();
    wm.resetSettings();  // เคลียร์ค่า WiFi
    Serial.println("WiFi settings cleared. Restarting...");
    delay(2000);
    ESP.restart();  // รีสตาร์ท ESP32
  }

  if (millis() - previousMainLoop >= 2000) {
    previousMainLoop = millis();
    float bufferPM25Value = readDustSensor();
    if (bufferPM25Value > 0) pm25Value = bufferPM25Value;
    co2Value = readMQ135("CO2");
    coValue = readMQ7();
    dhtValue = readDHT11();
    pm25Quality = checkQualityPM25(pm25Value);
    co2Quality = checkQualityCO2(co2Value);
    coQuality = checkQualityCO(coValue);
    humidLevel = checkLevelHumid(dhtValue[0]);
    tempLevel = checkLevelTemperature(dhtValue[1]);

    Serial.printf("ค่าฝุ่น: %.2f ug/m³ %s | ", pm25Value, pm25Quality.c_str());
    Serial.printf("ค่า CO: %.2f ppm %s | ", coValue, coQuality.c_str());
    Serial.printf("ค่า CO2: %.2f ppm %s | ", co2Value, co2Quality.c_str());
    Serial.printf("ค่า Humid: %.2f % ค่า Temp: %.2f *C\n", dhtValue[0], dhtValue[1]);

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
    humidDoc["quality"] = humidLevel;

    // ใส่ค่า Temperature
    temperatureDoc["unit"] = "*C";
    temperatureDoc["value"] = dhtValue[1];
    temperatureDoc["quality"] = tempLevel;

    // แปลง JSON เป็น String
    char jsonStr[256];
    size_t jsonSize;
    bool success;

    if (deviceConnected) {
      // สร้าง JSON document ขนาดใหญ่พอสมควร
      StaticJsonDocument<512> dataDoc;

      // ใส่ค่าฝุ่น PM2.5
      JsonObject pm25Obj = dataDoc.createNestedObject("pm25");
      pm25Obj["unit"] = "ug/m³";
      pm25Obj["value"] = pm25Value;
      pm25Obj["quality"] = pm25Quality;

      // ใส่ค่า CO2
      JsonObject co2Obj = dataDoc.createNestedObject("co2");
      co2Obj["unit"] = "ppm";
      co2Obj["value"] = co2Value;
      co2Obj["quality"] = co2Quality;

      // ใส่ค่า CO
      JsonObject coObj = dataDoc.createNestedObject("co");
      coObj["unit"] = "ppm";
      coObj["value"] = coValue;
      coObj["quality"] = coQuality;

      // ใส่ค่า Humidity
      JsonObject humidObj = dataDoc.createNestedObject("humid");
      humidObj["unit"] = "%";
      humidObj["value"] = dhtValue[0];
      humidObj["quality"] = humidLevel;

      // ใส่ค่า Temperature
      JsonObject tempObj = dataDoc.createNestedObject("temperature");
      tempObj["unit"] = "*C";
      tempObj["value"] = dhtValue[1];
      tempObj["quality"] = tempLevel;

      char compactDataStr[512];
      jsonSize = serializeJson(dataDoc, compactDataStr);

      sensorCharacteristic->setValue((uint8_t*)compactDataStr, jsonSize);
      sensorCharacteristic->notify();
      Serial.println("Sent JSON via BLE");
    }

    if (WiFi.status() != WL_CONNECTED) {
      //reconnectWiFi();
      statusWifi = "Connecting";
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
      statusWifi = "Connected";
    }
    // ✅ ตรวจสอบและเชื่อมต่อ MQTT ใหม่ถ้าหลุด (ไม่บล็อก)
    if (!client.connected()) {
      reconnectMQTT();
    }
  }

  client.loop();
  // Clear the display on each frame. We draw from the _circularBuffer
  display.clearDisplay();
  // erase status bar by drawing all black
  display.fillRect(0, 0, display.width(), 8, SSD1306_BLACK);
  // print all value to OLED including show status
  printOLED(pm25Value, pm25Quality, coValue, coQuality, co2Value, co2Quality, dhtValue[0], humidLevel, dhtValue[1], tempLevel, statusWifi);

  delay(DELAY_LOOP_MS);
}
