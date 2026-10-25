const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ==========================================
// 1. 16:9 広範囲マップ用（位置・横伸び・縦伸び補正込み）
// ==========================================
const MIN_LAT = 20.0;
const MAX_LAT = 50.0;
const MIN_LNG = 118.0;
const MAX_LNG = 150.0;

const X_OFFSET = -0.075;
const Y_OFFSET = 0.065;
const X_SCALE  = 0.76;
const Y_SCALE  = 1.40;

function convertLatLonToPosition(lat, lon) {
    let normalizedX = (lon - MIN_LNG) / (MAX_LNG - MIN_LNG);
    let x = 0.5 + (normalizedX - 0.5) * X_SCALE + X_OFFSET;
    
    let normalizedY = 1.0 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT);
    let y = 0.5 + (normalizedY - 0.5) * Y_SCALE + Y_OFFSET;
    
    return { x, y };
}

// ==========================================
// 2. stations.csv の読み込みと座標変換
// ==========================================
let stations = [];

try {
    const csvPath = path.join(__dirname, 'stations.csv');
    if (fs.existsSync(csvPath)) {
        // utf-8 または通常読み込みで安全に処理
        const rawContent = fs.readFileSync(csvPath, 'utf8');
        const lines = rawContent.split(/\r?\n/);
        
        lines.forEach((line) => {
            if (!line.trim() || line.startsWith('#')) return;
            
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            if (cols.length < 6) return;

            const code = cols[1];
            const name = cols[2];
            const lat = parseFloat(cols[4]);
            const lon = parseFloat(cols[5]);

            if (code && !isNaN(lat) && !isNaN(lon)) {
                const pos = convertLatLonToPosition(lat, lon);
                stations.push({
                    code: code,
                    name: name || "",
                    lat: lat,
                    lon: lon,
                    x: parseFloat(pos.x.toFixed(4)),
                    y: parseFloat(pos.y.toFixed(4)),
                    scale: 0
                });
            }
        });

        console.log(`【サーバー】防災科研CSVの読み込みが完了しました。総観測点数: ${stations.length} 件`);
    } else {
        console.warn('【警告】stations.csv が見つかりません。');
    }
} catch (e) {
    console.error('【エラー】stations.csv の読み込みに失敗しました:', e);
}

// ==========================================
// 3. P2P地震情報 API からのリアルタイムデータ取得
// ==========================================
let latestEEW = {
    type: "Forecast",
    epicenter: "待機中",
    intensity: "-",
    magnitude: "-",
    time: "--:--"
};

async function fetchEarthquakeData() {
    try {
        const response = await axios.get('https://api.p2pquake.net/v2/history?codes=551,552&limit=1', {
            timeout: 5000
        });
        
        const latestData = response.data[0];
        
        if (latestData) {
            let issueType = "Forecast";
            if (latestData.issue && latestData.issue.type === "EmergencyWarning") {
                issueType = "Warning";
            }

            let epicenterName = "不明";
            if (latestData.earthquake && latestData.earthquake.hypocenter) {
                epicenterName = latestData.earthquake.hypocenter.name || "不明";
            }

            let maxScale = 0;
            if (latestData.earthquake) {
                maxScale = latestData.earthquake.maxScale || 0;
            }
            let intensityStr = convertScaleToString(maxScale);

            let magnitude = -1;
            if (latestData.earthquake && latestData.earthquake.hypocenter) {
                magnitude = latestData.earthquake.hypocenter.magnitude;
            }
            let magStr = (magnitude >= 0) ? magnitude.toFixed(1) : "-";

            let timeStr = "--:--";
            if (latestData.earthquake) {
                timeStr = latestData.earthquake.time || "--:--";
            }

            latestEEW = {
                type: issueType,
                epicenter: epicenterName,
                intensity: intensityStr,
                magnitude: magStr,
                time: timeStr
            };

            console.log(`[地震情報更新] ${issueType} - 震源: ${epicenterName}, 予想震度: ${intensityStr}`);
        }
    } catch (error) {
        console.error("地震情報の取得に失敗しました:", error.message);
    }
}

function convertScaleToString(scale) {
    switch (scale) {
        case 10: return "1";
        case 20: return "2";
        case 30: return "3";
        case 40: return "4";
        case 45: return "5弱";
        case 50: return "5強";
        case 55: return "6弱";
        case 60: return "6強";
        case 70: return "7";
        default: return "-";
    }
}

setInterval(fetchEarthquakeData, 10000);
fetchEarthquakeData();

// ==========================================
// 4. APIエンドポイントの設定
// ==========================================
app.get('/', (req, res) => {
    res.send("IQuake-Cloud Server is running and active!");
});

app.get('/api/stations', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(stations);
});

app.get('/api/eew', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(latestEEW);
});

// ==========================================
// 5. サーバー起動
// ==========================================
app.listen(PORT, () => {
    console.log(`IQuake-Cloud 中継サーバーがポート ${PORT} で稼働中`);
});