const mqtt = require('mqtt');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// KONFIGURASI - SESUAIKAN DENGAN IP KOMPUTER ORANG 2
// Cari tahu IP yang benar dari Orang 2 (bukan 192.168.220.221)
const INFLUX_URL = 'http://10.150.126.111:8086'; // ← GANTI DENGAN IP network engineer!
const INFLUX_TOKEN = 'K7zLzLuMkLuhRBMPyfnlQOYgKYjfEFW8MG9hPNKQqwM5QjsWUc8Rxx5ngQf_nnVGr_-7aXC5i05YwQUjNX4emA=='; // ← Sesuaikan token yang ada di influxDB!
const INFLUX_ORG = 'sekolahku';
const INFLUX_BUCKET = 'sensor_data';

// MQTT Broker
const MQTT_BROKER = 'mqtt://10.150.126.111:1883'; // ← GANTI DENGAN IP network engineer!
const MQTT_TOPIC = 'sensor/data';

// Setup InfluxDB
const influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN, timeout: 30000 });
const writeApi = influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET);

// Setup MQTT
const mqttClient = mqtt.connect(MQTT_BROKER);

let dataBuffer = [];
let isWriting = false;

// Perbaiki console.log - gunakan tanda = bukan ...
console.log('='.repeat(50));
console.log('🚀 SUBSCRIBER MQTT → INFLUXDB');
console.log('='.repeat(50));
console.log(`📡 MQTT Broker: ${MQTT_BROKER}`);
console.log(`📡 Topic: ${MQTT_TOPIC}`);
console.log(`💾 InfluxDB: ${INFLUX_URL}`);
console.log('='.repeat(50));

async function flushToInfluxDB() {
    if (isWriting || dataBuffer.length === 0) return;

    isWriting = true;
    const pointsToWrite = [...dataBuffer];
    dataBuffer = [];

    try {
        writeApi.writePoints(pointsToWrite);
        await writeApi.flush();
        console.log(`💾 Batch: ${pointsToWrite.length} data tersimpan`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        dataBuffer = [...pointsToWrite, ...dataBuffer];
    } finally {
        isWriting = false;
    }
}

setInterval(flushToInfluxDB, 5000);

mqttClient.on('connect', () => {
    console.log('✅ MQTT Connected');
    mqttClient.subscribe(MQTT_TOPIC);
});

mqttClient.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        console.log(`\n📥 Suhu: ${data.temperature}°C | Kelembapan: ${data.humidity}%`);

        const point = new Point('sensor_data')
            .floatField('temperature', data.temperature)
            .floatField('humidity', data.humidity)
            .tag('sensor_id', data.sensor_id || 'NodeJS');

        dataBuffer.push(point);
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
});

console.log('\n📡 Menunggu data...\n');