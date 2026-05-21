const express = require('express');
const session = require('express-session');
const { InfluxDB } = require('@influxdata/influxdb-client');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'rahasia123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ========== KONFIGURASI ==========
const PORT = 3000;
const ZEROTIER_IP = '10.150.126.72';// Ganti dengan IP ZeroTier frontend engineer!

const INFLUX_URL = 'http://10.150.126.111:8086';
const INFLUX_TOKEN = 'K7zLzLuMkLuhRBMPyfnlQOYgKYjfEFW8MG9hPNKQqwM5QjsWUc8Rxx5ngQf_nnVGr_-7aXC5i05YwQUjNX4emA==';
const INFLUX_ORG = 'sekolahku';
const INFLUX_BUCKET = 'sensor_data';

const USERNAME = 'admin';
const PASSWORD = '12345';

// ========== INISIALISASI INFLUXDB ==========
const influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const queryApi = influxClient.getQueryApi(INFLUX_ORG);
const writeApi = influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET);

console.log('='.repeat(50));
console.log('🌡️ DASHBOARD WEB SENSOR');
console.log('='.repeat(50));
console.log(`🔐 Login: ${USERNAME} / ${PASSWORD}`);
console.log(`💾 InfluxDB: ${INFLUX_URL}`);
console.log(`🌐 Server: http://${ZEROTIER_IP}:${PORT}`);
console.log('='.repeat(50));

// ========== TEST KONEKSI INFLUXDB ==========
async function testInfluxConnection() {
    try {
        const query = `from(bucket: "${INFLUX_BUCKET}") |> range(start: -1m) |> limit(n: 1)`;
        await queryApi.collectRows(query);
        console.log('✅ Connected to InfluxDB successfully');
    } catch (error) {
        console.error('❌ Cannot connect to InfluxDB:', error.message);
        console.log('⚠️ Make sure InfluxDB is running at:', INFLUX_URL);
    }
}

// ========== FUNGSI BACA DATA ==========
async function getLatestData() {
    const query = `
        from(bucket: "${INFLUX_BUCKET}")
        |> range(start: -1h)
        |> last()
    `;

    try {
        const result = await queryApi.collectRows(query);

        if (result.length > 0) {
            let suhu = '--';
            let kelembapan = '--';

            for (let row of result) {
                if (row._field === 'temperature') {
                    suhu = row._value;
                }
                if (row._field === 'humidity') {
                    kelembapan = row._value;
                }
            }

            return {
                temperature: suhu,
                humidity: kelembapan,
                last_update: new Date().toLocaleString()
            };
        }
        return { temperature: '--', humidity: '--', last_update: new Date().toLocaleString() };
    } catch (error) {
        console.error('Query error:', error);
        return { temperature: '--', humidity: '--', last_update: new Date().toLocaleString() };
    }
}

async function getHistoryData(hours = 24) {
    const query = `
        from(bucket: "${INFLUX_BUCKET}")
        |> range(start: -${hours}h)
        |> filter(fn: (r) => r._field == "temperature" or r._field == "humidity")
        |> aggregateWindow(every: 1h, fn: mean)
    `;

    try {
        const result = await queryApi.collectRows(query);
        const history = {};
        
        for (let row of result) {
            const time = row._time;
            if (!history[time]) history[time] = {};
            if (row._field === 'temperature') history[time].temperature = row._value;
            if (row._field === 'humidity') history[time].humidity = row._value;
        }
        
        return Object.entries(history).map(([time, data]) => ({
            time: new Date(time),
            temperature: data.temperature || '--',
            humidity: data.humidity || '--'
        }));
    } catch (error) {
        console.error('History query error:', error);
        return [];
    }
}

// ========== ENDPOINT API ==========
app.post('/api/sensor', async(req, res) => {
    try {
        const { temperature, humidity, device, status } = req.body;

        console.log(`📥 Received: Temp=${temperature}°C, Humidity=${humidity}%, Device=${device}`);

        await writeApi.writePoint({
            measurement: 'sensor_readings',
            tags: { device: device || 'iot-1', status: status || 'normal' },
            fields: { temperature: parseFloat(temperature) },
            timestamp: new Date()
        });

        if (humidity) {
            await writeApi.writePoint({
                measurement: 'sensor_readings',
                tags: { device: device || 'iot-1', status: status || 'normal' },
                fields: { humidity: parseFloat(humidity) },
                timestamp: new Date()
            });
        }

        await writeApi.flush();
        res.json({ success: true, message: 'Data saved to InfluxDB' });

    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/latest', requireLogin, async(req, res) => {
    const data = await getLatestData();
    res.json(data);
});

app.get('/api/history', requireLogin, async(req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    const data = await getHistoryData(hours);
    res.json(data);
});

// ========== MIDDLEWARE LOGIN ==========
function requireLogin(req, res, next) {
    if (req.session.logged_in) next();
    else res.redirect('/login');
}

// ========== ROUTES ==========
app.get('/', (req, res) => res.redirect('/login'));

// Login Page with Dark/Light mode
app.get('/login', (req, res) => {
    if (req.session.logged_in) return res.redirect('/dashboard');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SensorHub · Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}

:root {
  --bg: #f5f7fb;
  --surface: #ffffff;
  --surface2: #f8f9fc;
  --surface3: #eef2f7;
  --border: rgba(0,0,0,0.08);
  --border2: rgba(0,0,0,0.12);
  --text: #1a1f36;
  --text2: #5a6e8a;
  --text3: #8a9bb5;
  --violet: #5b52d4;
  --violet2: #7c6ff7;
  --violet-dim: rgba(91,82,212,0.08);
  --violet-glow: rgba(91,82,212,0.15);
  --green: #10b981;
  --green-dim: rgba(16,185,129,0.1);
}

[data-theme="dark"] {
  --bg: #07090f;
  --surface: #0d1117;
  --surface2: #11161f;
  --surface3: #161c27;
  --border: rgba(255,255,255,0.06);
  --border2: rgba(255,255,255,0.1);
  --text: #e2e6f0;
  --text2: rgba(190,200,220,0.7);
  --text3: rgba(150,165,190,0.5);
  --violet: #7c6ff7;
  --violet2: #a99ff9;
  --violet-dim: rgba(124,111,247,0.12);
  --violet-glow: rgba(124,111,247,0.22);
  --green: #4ade80;
  --green-dim: rgba(74,222,128,0.1);
}

body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);min-height:100vh;display:flex;align-items:center;justify-content:center;transition:all 0.3s ease;position:relative;}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(91,82,212,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(91,82,212,0.04) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0;}
.wrap{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;width:100%;max-width:420px;padding:24px;}
.logo-mark{display:flex;align-items:center;gap:10px;margin-bottom:40px;animation:fadeDown 0.6s ease both;}
.logo-icon{width:38px;height:38px;background:linear-gradient(135deg,var(--violet2),var(--violet));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 0 24px var(--violet-glow);}
.logo-name{font-size:18px;font-weight:700;color:var(--text);}
.logo-tag{font-size:11px;font-weight:500;color:var(--text3);}
@keyframes fadeDown{from{opacity:0;transform:translateY(-16px);}to{opacity:1;transform:translateY(0);}}
.card{width:100%;background:var(--surface);border:1px solid var(--border2);border-radius:20px;padding:36px 32px 32px;position:relative;animation:fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both;box-shadow:0 24px 64px rgba(0,0,0,0.08);}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}
.theme-toggle{position:absolute;top:20px;right:20px;cursor:pointer;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:8px 12px;font-size:14px;transition:all 0.2s;z-index:20;}
.theme-toggle:hover{background:var(--surface3);}
.card-title{font-size:24px;font-weight:700;color:var(--text);margin-bottom:8px;}
.card-sub{font-size:13px;color:var(--text2);margin-bottom:28px;}
.field{margin-bottom:16px;}
.field label{display:block;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-bottom:7px;}
.field input{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);font-family:inherit;outline:none;transition:all 0.2s;}
.field input:focus{border-color:var(--violet2);background:var(--violet-dim);box-shadow:0 0 0 3px var(--violet-glow);}
.submit-btn{width:100%;margin-top:22px;padding:12px;background:linear-gradient(135deg,var(--violet2),var(--violet));border:none;border-radius:12px;font-size:14px;font-weight:600;color:white;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 20px var(--violet-glow);}
.submit-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px var(--violet-glow);}
.hint{margin-top:18px;text-align:center;font-size:12px;color:var(--text3);}
.error-box{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:11px 14px;margin-bottom:20px;font-size:13px;color:#ef4444;}
</style>
</head>
<body>
<div class="theme-toggle" onclick="toggleTheme()" id="themeToggle">🌙 Dark</div>
<div class="wrap">
  <div class="logo-mark">
    <div class="logo-icon">🌡️</div>
    <div><div class="logo-name">SensorHub</div><div class="logo-tag">MONITORING PLATFORM</div></div>
  </div>
  <div class="card">
    <div class="card-title">Welcome back</div>
    <div class="card-sub">Sign in to your dashboard</div>
    ${req.query.error ? '<div class="error-box">⚠ Invalid credentials</div>' : ''}
    <form method="POST" action="/login">
      <div class="field"><label>Username</label><input type="text" name="username" required></div>
      <div class="field"><label>Password</label><input type="password" name="password" required></div>
      <button type="submit" class="submit-btn">Sign In →</button>
    </form>
    <div class="hint">admin / 12345</div>
  </div>
</div>
<script>
function toggleTheme(){
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  document.getElementById('themeToggle').textContent = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
}
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('themeToggle').textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
</script>
</body>
</html>`);
});

app.post('/login', (req, res) => {
    if (req.body.username === USERNAME && req.body.password === PASSWORD) {
        req.session.logged_in = true;
        res.redirect('/dashboard');
    } else {
        res.redirect('/login?error=1');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ========== DASHBOARD UTAMA ==========
app.get('/dashboard', requireLogin, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SensorHub Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --bg:#f5f7fb;
  --surface:#ffffff;
  --surface2:#f8f9fc;
  --surface3:#eef2f7;
  --border:rgba(0,0,0,0.06);
  --border2:rgba(0,0,0,0.1);
  --text:#1a1f36;
  --text2:#5a6e8a;
  --text3:#8a9bb5;
  --violet:#5b52d4;
  --violet2:#7c6ff7;
  --violet-dim:rgba(91,82,212,0.08);
  --violet-glow:rgba(91,82,212,0.15);
  --green:#10b981;
  --green-dim:rgba(16,185,129,0.1);
  --red:#ef4444;
  --red-dim:rgba(239,68,68,0.1);
  --blue:#3b82f6;
  --yellow:#f59e0b;
  --sidebar-w:240px;
  --font:'Inter',-apple-system,sans-serif;
}
[data-theme="dark"]{
  --bg:#07090f;
  --surface:#0d1117;
  --surface2:#11161f;
  --surface3:#161c27;
  --border:rgba(255,255,255,0.06);
  --border2:rgba(255,255,255,0.1);
  --text:#e2e6f0;
  --text2:rgba(190,200,220,0.7);
  --text3:rgba(150,165,190,0.5);
  --violet:#7c6ff7;
  --violet2:#a99ff9;
  --violet-dim:rgba(124,111,247,0.12);
  --violet-glow:rgba(124,111,247,0.22);
  --green:#4ade80;
  --green-dim:rgba(74,222,128,0.1);
  --red:#f87171;
  --red-dim:rgba(248,113,113,0.1);
  --blue:#38bdf8;
  --yellow:#fbbf24;
}
html,body{height:100%;overflow:hidden;font-family:var(--font);}
body{background:var(--bg);color:var(--text);display:flex;transition:all 0.3s ease;}

.sidebar{width:var(--sidebar-w);min-height:100vh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;z-index:20;}
.sb-header{padding:22px 20px 18px;border-bottom:1px solid var(--border);}
.sb-logo{display:flex;align-items:center;gap:10px;}
.sb-icon{width:34px;height:34px;background:linear-gradient(135deg,var(--violet2),var(--violet));border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;}
.sb-name{font-size:15px;font-weight:700;color:var(--text);}
.sb-tag{font-size:10px;font-weight:500;color:var(--text3);}
.sb-section{padding:18px 14px 6px;font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;}
.sb-item{display:flex;align-items:center;gap:10px;padding:9px 14px;margin:1px 6px;border-radius:9px;cursor:pointer;transition:all 0.18s;color:var(--text2);font-size:13px;font-weight:500;}
.sb-item:hover{background:var(--violet-dim);color:var(--violet2);}
.sb-item.active{background:var(--violet-dim);color:var(--violet2);}
.sb-footer{margin-top:auto;padding:16px 6px;border-top:1px solid var(--border);}
.sb-user{display:flex;align-items:center;gap:10px;padding:9px 14px;}
.sb-avatar{width:30px;height:30px;background:linear-gradient(135deg,var(--violet),var(--blue));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;}
.sb-user-info{flex:1;}
.sb-user-name{font-size:12px;font-weight:600;}
.sb-user-role{font-size:10px;color:var(--text3);}
.sb-logout{font-size:14px;color:var(--text3);cursor:pointer;text-decoration:none;}
.sb-logout:hover{color:var(--red);}

.main{flex:1;display:flex;flex-direction:column;min-width:0;height:100vh;overflow:hidden;}
.topbar{padding:18px 28px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;backdrop-filter:blur(12px);}
.tb-title{font-size:18px;font-weight:700;letter-spacing:-0.4px;}
.tb-sub{font-size:12px;color:var(--text3);margin-top:2px;}
.tb-right{display:flex;align-items:center;gap:10px;}
.tb-btn{padding:7px 14px;border-radius:8px;background:var(--surface2);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;transition:all 0.18s;font-family:var(--font);text-decoration:none;display:inline-flex;align-items:center;gap:6px;}
.tb-btn:hover{background:var(--surface3);color:var(--text);}
.tb-btn.primary{background:var(--violet-dim);border-color:rgba(124,111,247,0.3);color:var(--violet2);}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:livePulse 2s infinite;}
@keyframes livePulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 28px 32px;}
.content::-webkit-scrollbar{width:4px;}
.content::-webkit-scrollbar-thumb{background:var(--text3);border-radius:2px;}

.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;}
.modal-content{background:var(--surface);border-radius:16px;padding:24px;max-width:500px;width:90%;border:1px solid var(--border2);}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
.modal-close{cursor:pointer;font-size:24px;color:var(--text3);}
.modal-title{font-size:18px;font-weight:700;}
.modal-body{margin-bottom:20px;}
.modal-footer{display:flex;justify-content:flex-end;gap:10px;}

.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:20px;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;transition:all 0.2s;}
.kpi:hover{border-color:var(--border2);transform:translateY(-2px);}
.kpi-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-bottom:12px;display:flex;justify-content:space-between;}
.kpi-value{font-size:32px;font-weight:800;letter-spacing:-1.5px;color:var(--text);}
.kpi-unit{font-size:14px;font-weight:500;color:var(--text2);}
.kpi-meta{margin-top:10px;font-size:12px;color:var(--text3);}

.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px;}
.panel-header{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);}
.panel-title{font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;}
.panel-body{padding:20px;}
.main-grid{display:grid;grid-template-columns:1fr 320px;gap:16px;}
.chart-wrap{height:220px;position:relative;}
.data-table{width:100%;border-collapse:collapse;}
.data-table th{font-size:10px;font-weight:600;color:var(--text3);text-align:left;padding:0 0 12px;border-bottom:1px solid var(--border);}
.data-table td{padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--text2);}
.status-bar{padding:10px 28px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text3);background:var(--surface);flex-shrink:0;}
.theme-toggle{cursor:pointer;padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:12px;transition:all 0.2s;}
select, input{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-family:var(--font);}
.range-selector{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="sb-header"><div class="sb-logo"><div class="sb-icon">🌡️</div><div><div class="sb-name">SensorHub</div><div class="sb-tag">MONITORING</div></div></div></div>
  <div class="sb-section">Main</div>
  <div class="sb-item active" data-page="dashboard">📊 Dashboard</div>
  <div class="sb-item" data-page="analytics">📈 Analytics</div>
  <div class="sb-item" data-page="history">📜 History</div>
  <div class="sb-section">Management</div>
  <div class="sb-item" data-page="devices">⚙️ Devices</div>
  <div class="sb-item" data-page="alerts">🔔 Alerts</div>
  <div class="sb-item" data-page="reports">📋 Reports</div>
  <div class="sb-section">System</div>
  <div class="sb-item" data-page="settings">⚙️ Settings</div>
  <div class="sb-footer"><div class="sb-user"><div class="sb-avatar">A</div><div class="sb-user-info"><div class="sb-user-name">Admin</div><div class="sb-user-role">Operator</div></div><a href="/logout" class="sb-logout">↗</a></div></div>
</aside>

<div class="main">
  <div class="topbar">
    <div><div class="tb-title" id="pageTitle">Operations Dashboard</div><div class="tb-sub">Environmental monitoring</div></div>
    <div class="tb-right">
      <div class="theme-toggle" onclick="toggleTheme()" id="themeToggleBtn">🌙 Dark</div>
      <div class="tb-btn" onclick="exportData()">📥 Export Excel</div>
      <div class="tb-btn primary"><div class="live-dot"></div>Live</div>
    </div>
  </div>

  <div class="content" id="mainContent">
    <div id="dashboardView">
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-label">Temperature</div><div class="kpi-value" id="kpi-temp">--<span class="kpi-unit">°C</span></div><div class="kpi-meta"><span id="temp-status">Waiting...</span></div></div>
        <div class="kpi"><div class="kpi-label">Humidity</div><div class="kpi-value" id="kpi-hum">--<span class="kpi-unit">%</span></div><div class="kpi-meta"><span id="hum-status">Waiting...</span></div></div>
        <div class="kpi"><div class="kpi-label">System Status</div><div class="kpi-value" style="font-size:24px;" id="sys-status">● Online</div><div class="kpi-meta">Active</div></div>
        <div class="kpi"><div class="kpi-label">Data Points</div><div class="kpi-value" id="data-points">0</div><div class="kpi-meta">Collected</div></div>
      </div>
      <div class="main-grid">
        <div><div class="panel"><div class="panel-header"><div class="panel-title">Real-time Telemetry</div></div><div class="panel-body"><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div></div>
        <div class="panel"><div class="panel-header"><div class="panel-title">Latest Readings</div></div><div class="panel-body"><table class="data-table"><thead><tr><th>Time</th><th>Temp</th><th>Humidity</th><th>Status</th></tr></thead><tbody id="logTable"></tbody></table></div></div></div>
        <div class="panel"><div class="panel-header"><div class="panel-title">Device Status</div></div><div class="panel-body"><div id="deviceStatus">Loading...</div></div></div>
      </div>
    </div>

    <div id="analyticsView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Historical Analytics (24 Hours)</div><div class="tb-btn" onclick="exportAnalytics()">Export Chart Data</div></div><div class="panel-body"><div class="chart-wrap"><canvas id="historyChart"></canvas></div></div></div>
    </div>

    <div id="historyView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Data History</div><div class="tb-btn" onclick="exportHistory()">Export History</div></div><div class="panel-body"><div id="historyTable"></div></div></div>
    </div>

    <div id="devicesView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Connected Devices</div></div><div class="panel-body"><div id="devicesList"></div></div></div>
    </div>

    <div id="alertsView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Alert Rules & History</div></div><div class="panel-body"><div id="alertsList"></div></div></div>
    </div>

    <div id="reportsView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Generate Report</div></div><div class="panel-body">
        <div class="range-selector">
          <select id="reportRange">
            <option value="24">Last 24 Hours</option>
            <option value="48">Last 48 Hours</option>
            <option value="72">Last 3 Days</option>
            <option value="168">Last 7 Days</option>
            <option value="336">Last 14 Days</option>
            <option value="720">Last 30 Days</option>
          </select>
          <button class="tb-btn primary" onclick="generateReport()">📊 Generate Report</button>
          <button class="tb-btn" onclick="exportReport()">📥 Export Report</button>
        </div>
        <div id="reportPreview" style="margin-top:20px;"></div>
      </div></div>
    </div>

    <div id="settingsView" style="display:none;">
      <div class="panel"><div class="panel-header"><div class="panel-title">Settings</div></div><div class="panel-body">
        <div style="margin-bottom:16px;">Theme: <button class="tb-btn" onclick="toggleTheme()">Toggle Dark/Light</button></div>
        <div style="margin-bottom:16px;">Refresh Interval: <select id="intervalSelect"><option value="1000">1s</option><option value="2000" selected>2s</option><option value="5000">5s</option><option value="10000">10s</option></select></div>
        <div>API Endpoint: <code style="background:var(--surface2);padding:4px 8px;border-radius:4px;">/api/sensor</code></div>
      </div></div>
    </div>
  </div>

  <div class="status-bar"><span id="updateTime">Initializing...</span><span id="dataStatus">● Connected</span></div>
</div>

<div id="exportModal" class="modal">
  <div class="modal-content">
    <div class="modal-header"><div class="modal-title">Export Data</div><span class="modal-close" onclick="closeModal()">&times;</span></div>
    <div class="modal-body" id="modalBody">Processing...</div>
    <div class="modal-footer"><button class="tb-btn primary" onclick="downloadExport()">Download</button><button class="tb-btn" onclick="closeModal()">Cancel</button></div>
  </div>
</div>

<script>
let currentView = 'dashboard';
let historyData = [];
let refreshInterval = 2000;
let intervalId = null;
let chartData = [];
let logData = [];
let exportDataCache = null;

function toggleTheme(){
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  document.getElementById('themeToggleBtn').textContent = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('themeToggleBtn').textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';

document.querySelectorAll('.sb-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    currentView = page;
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('#mainContent > div').forEach(div => div.style.display = 'none');
    document.getElementById(page + 'View').style.display = 'block';
    document.getElementById('pageTitle').textContent = page.charAt(0).toUpperCase() + page.slice(1);
    if(page === 'analytics') loadHistoryChart();
    if(page === 'history') loadHistoryTable();
    if(page === 'devices') loadDevices();
    if(page === 'alerts') loadAlerts();
  });
});

const mainCtx = document.getElementById('mainChart')?.getContext('2d');
let mainChart = null;
if(mainCtx){
  mainChart = new Chart(mainCtx,{
    type:'line',
    data:{labels:[],datasets:[
      {label:'Temperature °C',borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.1)',borderWidth:2,data:[],tension:0.4,fill:true},
      {label:'Humidity %',borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',borderWidth:2,data:[],tension:0.4,fill:true}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false}}
  });
}

let historyChart = null;
function loadHistoryChart(){
  fetch('/api/history?hours=24')
    .then(res => res.json())
    .then(data => {
      if(historyChart) historyChart.destroy();
      const ctx = document.getElementById('historyChart')?.getContext('2d');
      if(ctx){
        historyChart = new Chart(ctx,{
          type:'line',
          data:{labels:data.map(d=>new Date(d.time).toLocaleTimeString()),datasets:[
            {label:'Temperature (°C)',borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.1)',data:data.map(d=>d.temperature),tension:0.4,fill:true},
            {label:'Humidity (%)',borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',data:data.map(d=>d.humidity),tension:0.4,fill:true}
          ]},
          options:{responsive:true,maintainAspectRatio:false}
        });
        historyData = data;
      }
    });
}

function loadHistoryTable(){
  fetch('/api/history?hours=168')
    .then(res => res.json())
    .then(data => {
      let html = '<table class="data-table"><thead><tr><th>Time</th><th>Temperature (°C)</th><th>Humidity (%)</th><th>Status</th></tr></thead><tbody>';
      for(let d of data.slice(-50).reverse()){
        const tempOk = d.temperature >= 18 && d.temperature <= 30;
        const humOk = d.humidity >= 40 && d.humidity <= 70;
        html += '<tr><td>' + new Date(d.time).toLocaleString() + '</td><td>' + d.temperature.toFixed(1) + '°C</td><td>' + d.humidity.toFixed(1) + '%</td><td>' + (tempOk && humOk ? '✓ Normal' : '⚠ Alert') + '</td></tr>';
      }
      html += '</tbody></table>';
      document.getElementById('historyTable').innerHTML = html;
    });
}

function loadDevices(){
  document.getElementById('devicesList').innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;">' +
    '<div style="padding:16px;background:var(--surface2);border-radius:12px;border-left:3px solid var(--green);">' +
    '<div style="display:flex;justify-content:space-between;"><strong>🌡️ IoT-1 Sensor</strong><span style="color:var(--green);">● Online</span></div>' +
    '<div style="font-size:12px;color:var(--text3);margin-top:8px;">Location: Server Room A</div>' +
    '<div style="font-size:12px;color:var(--text3);">Last seen: Just now</div>' +
    '<div style="font-size:12px;color:var(--text3);">Battery: 98%</div></div>' +
    '<div style="padding:16px;background:var(--surface2);border-radius:12px;border-left:3px solid var(--yellow);">' +
    '<div style="display:flex;justify-content:space-between;"><strong>🌡️ IoT-2 Sensor</strong><span style="color:var(--yellow);">● Standby</span></div>' +
    '<div style="font-size:12px;color:var(--text3);margin-top:8px;">Location: Warehouse B</div>' +
    '<div style="font-size:12px;color:var(--text3);">Last seen: 2 hours ago</div>' +
    '<div style="font-size:12px;color:var(--text3);">Battery: 67%</div></div></div>';
}

function loadAlerts(){
  document.getElementById('alertsList').innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div style="padding:12px;background:var(--red-dim);border-radius:8px;border-left:3px solid var(--red);">' +
    '<strong>⚠ Critical Alert</strong><br><span style="font-size:12px;">Temperature exceeds 30°C threshold</span>' +
    '<span style="font-size:11px;color:var(--text3);display:block;margin-top:4px;">Triggered: 5 minutes ago</span></div>' +
    '<div style="padding:12px;background:var(--yellow-dim);border-radius:8px;border-left:3px solid var(--yellow);">' +
    '<strong>⚠ Warning Alert</strong><br><span style="font-size:12px;">Humidity below 40% threshold</span>' +
    '<span style="font-size:11px;color:var(--text3);display:block;margin-top:4px;">Triggered: 15 minutes ago</span></div>' +
    '<div style="padding:12px;background:var(--green-dim);border-radius:8px;border-left:3px solid var(--green);">' +
    '<strong>✓ Resolved</strong><br><span style="font-size:12px;">System back to normal operation</span>' +
    '<span style="font-size:11px;color:var(--text3);display:block;margin-top:4px;">Resolved: 1 hour ago</span></div></div>';
}

function exportData(){
  fetch('/api/history?hours=168')
    .then(res => res.json())
    .then(data => {
      const wsData = [['Timestamp','Temperature (°C)','Humidity (%)','Status']];
      for(let d of data){
        const tempOk = d.temperature >= 18 && d.temperature <= 30;
        const humOk = d.humidity >= 40 && d.humidity <= 70;
        const status = (tempOk && humOk) ? 'Normal' : 'Alert';
        wsData.push([new Date(d.time).toLocaleString(), d.temperature, d.humidity, status]);
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sensor Data');
      XLSX.writeFile(wb, 'sensor_data_' + new Date().toISOString().slice(0,19).replace(/:/g, '-') + '.xlsx');
    })
    .catch(err => { alert('Error exporting data: ' + err.message); });
}

function exportAnalytics(){
  if(historyData && historyData.length){
    const wsData = [['Timestamp','Temperature (°C)','Humidity (%)']];
    for(let d of historyData){
      wsData.push([new Date(d.time).toLocaleString(), d.temperature, d.humidity]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analytics Data');
    XLSX.writeFile(wb, 'analytics_' + new Date().toISOString().slice(0,19).replace(/:/g, '-') + '.xlsx');
  } else {
    alert('No analytics data available');
  }
}

function exportHistory(){
  fetch('/api/history?hours=720')
    .then(res => res.json())
    .then(data => {
      const wsData = [['Timestamp','Temperature (°C)','Humidity (%)','Status']];
      for(let d of data){
        const tempOk = d.temperature >= 18 && d.temperature <= 30;
        const humOk = d.humidity >= 40 && d.humidity <= 70;
        wsData.push([new Date(d.time).toLocaleString(), d.temperature, d.humidity, (tempOk && humOk) ? 'Normal' : 'Alert']);
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'History Data');
      XLSX.writeFile(wb, 'history_' + new Date().toISOString().slice(0,19).replace(/:/g, '-') + '.xlsx');
    });
}

async function generateReport(){
  const hours = parseInt(document.getElementById('reportRange').value);
  const response = await fetch('/api/history?hours=' + hours);
  const data = await response.json();
  
  if(data.length === 0){
    document.getElementById('reportPreview').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">No data available for selected period</div>';
    return;
  }
  
  const temps = [];
  const hums = [];
  for(let d of data){
    if(d.temperature !== '--') temps.push(d.temperature);
    if(d.humidity !== '--') hums.push(d.humidity);
  }
  
  const avgTemp = (temps.reduce((a,b) => a + b, 0) / temps.length).toFixed(1);
  const maxTemp = Math.max(...temps).toFixed(1);
  const minTemp = Math.min(...temps).toFixed(1);
  const avgHum = (hums.reduce((a,b) => a + b, 0) / hums.length).toFixed(1);
  const maxHum = Math.max(...hums).toFixed(1);
  const minHum = Math.min(...hums).toFixed(1);
  let alertCount = 0;
  for(let d of data){
    if(d.temperature < 18 || d.temperature > 30 || d.humidity < 40 || d.humidity > 70) alertCount++;
  }
  
  const firstTime = data[0] ? new Date(data[0].time).toLocaleDateString() : '-';
  const lastTime = data[data.length-1] ? new Date(data[data.length-1].time).toLocaleDateString() : '-';
  
  const html = '<div style="background:var(--surface2);border-radius:12px;padding:20px;">' +
    '<h4 style="margin-bottom:16px;">Report Summary (Last ' + hours + ' Hours)</h4>' +
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">' +
    '<div><strong>📊 Temperature</strong><br>Average: ' + avgTemp + '°C<br>Max: ' + maxTemp + '°C<br>Min: ' + minTemp + '°C</div>' +
    '<div><strong>💧 Humidity</strong><br>Average: ' + avgHum + '%<br>Max: ' + maxHum + '%<br>Min: ' + minHum + '%</div>' +
    '<div><strong>⚠ Alerts</strong><br>Total: ' + alertCount + ' events<br>Normal: ' + (data.length - alertCount) + ' readings</div>' +
    '<div><strong>📈 Data Points</strong><br>Total: ' + data.length + ' records<br>Period: ' + firstTime + ' - ' + lastTime + '</div>' +
    '</div></div>';
  document.getElementById('reportPreview').innerHTML = html;
  exportDataCache = data;
}

function exportReport(){
  if(exportDataCache && exportDataCache.length){
    const wsData = [['Timestamp','Temperature (°C)','Humidity (%)','Status']];
    for(let d of exportDataCache){
      const tempOk = d.temperature >= 18 && d.temperature <= 30;
      const humOk = d.humidity >= 40 && d.humidity <= 70;
      wsData.push([new Date(d.time).toLocaleString(), d.temperature, d.humidity, (tempOk && humOk) ? 'Normal' : 'Alert']);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, 'sensor_report_' + new Date().toISOString().slice(0,19).replace(/:/g, '-') + '.xlsx');
  } else {
    alert('Please generate a report first');
  }
}

function closeModal(){
  document.getElementById('exportModal').style.display = 'none';
}

function downloadExport(){
  if(exportDataCache){
    exportReport();
  }
  closeModal();
}

function updateDashboard(){
  fetch('/api/latest')
    .then(res => res.json())
    .then(data => {
      if(data.temperature !== '--'){
        const t = parseFloat(data.temperature);
        const h = parseFloat(data.humidity);
        document.getElementById('kpi-temp').innerHTML = t.toFixed(1) + '<span class="kpi-unit">°C</span>';
        document.getElementById('kpi-hum').innerHTML = h.toFixed(1) + '<span class="kpi-unit">%</span>';
        
        const tempOk = t >= 18 && t <= 30;
        const humOk = h >= 40 && h <= 70;
        document.getElementById('temp-status').innerHTML = tempOk ? '✓ Normal (18-30°C)' : '⚠ Warning';
        document.getElementById('temp-status').style.color = tempOk ? 'var(--green)' : 'var(--red)';
        document.getElementById('hum-status').innerHTML = humOk ? '✓ Normal (40-70%)' : '⚠ Warning';
        document.getElementById('hum-status').style.color = humOk ? 'var(--green)' : 'var(--red)';
        
        document.getElementById('deviceStatus').innerHTML = '<div style="padding:8px;background:var(--surface2);border-radius:8px;">IoT-1 Sensor<br>● Online<br>Last update: ' + new Date().toLocaleTimeString() + '</div>';
        
        const now = new Date();
        const label = now.toLocaleTimeString();
        chartData.push({label, t, h});
        if(chartData.length > 20) chartData.shift();
        if(mainChart){
          mainChart.data.labels = chartData.map(function(d){ return d.label; });
          mainChart.data.datasets[0].data = chartData.map(function(d){ return d.t; });
          mainChart.data.datasets[1].data = chartData.map(function(d){ return d.h; });
          mainChart.update();
        }
        
        logData.unshift({time: now.toLocaleTimeString(), t: t, h: h});
        if(logData.length > 10) logData.pop();
        const tbody = document.getElementById('logTable');
        if(tbody){
          let logHtml = '';
          for(let i = 0; i < logData.length; i++){
            const d = logData[i];
            const status = (d.t>=18 && d.t<=30 && d.h>=40 && d.h<=70) ? '✓ Normal' : '⚠ Alert';
            logHtml += '<tr><td>' + d.time + '</td><td>' + d.t.toFixed(1) + '°C</td><td>' + d.h.toFixed(1) + '%</td><td>' + status + '</td></tr>';
          }
          tbody.innerHTML = logHtml;
        }
        
        let points = parseInt(document.getElementById('data-points').innerText) || 0;
        document.getElementById('data-points').innerHTML = points + 1;
        
        document.getElementById('updateTime').textContent = 'Updated: ' + now.toLocaleTimeString();
        document.getElementById('dataStatus').innerHTML = '● Online';
        document.getElementById('dataStatus').style.color = 'var(--green)';
      } else {
        document.getElementById('dataStatus').innerHTML = '○ No Signal';
        document.getElementById('dataStatus').style.color = 'var(--red)';
      }
    })
    .catch(function() { 
      document.getElementById('dataStatus').innerHTML = '○ Offline';
      document.getElementById('dataStatus').style.color = 'var(--red)';
    });
}

const intervalSelect = document.getElementById('intervalSelect');
if(intervalSelect){
  intervalSelect.addEventListener('change', function(e) {
    refreshInterval = parseInt(e.target.value);
    if(intervalId) clearInterval(intervalId);
    intervalId = setInterval(updateDashboard, refreshInterval);
  });
}

intervalId = setInterval(updateDashboard, refreshInterval);
updateDashboard();
loadDevices();
loadAlerts();
</script>
</body>
</html>`);
});

// ========== JALANKAN SERVER ==========
testInfluxConnection().then(() => {
    app.listen(PORT, ZEROTIER_IP, () => {
        console.log(`✅ Dashboard running on http://${ZEROTIER_IP}:${PORT}`);
        console.log(`📡 API Endpoint for IoT: POST to http://${ZEROTIER_IP}:${PORT}/api/sensor`);
    });
});