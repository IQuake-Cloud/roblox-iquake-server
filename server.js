const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 16:9 広範囲マップ用（位置・横伸び・縦伸び補正込み）
const MIN_LAT = 20.0;
const MAX_LAT = 50.0;
const MIN_LNG = 118.0;
const MAX_LNG = 150.0;

// ▼▼▼【位置と縦横の広がり具合の微調整パラメータ】▼▼▼
const X_OFFSET = -0.08; // 全体を「左」へ動かす（マイナス）
const Y_OFFSET = 0.065;  // 全体を「下」へ動かす（プラス）
const X_SCALE  = 0.79;   // 横方向への引き伸ばし倍率（1.0より大きくすると横に広がります）
const Y_SCALE  = 1.425;   // 縦方向への引き伸ばし倍率（1.0より大きくすると縦に伸びます）

function convertLatLonToPosition(lat, lon) {
    // 経度を正規化したあと、中心（0.5）を基準にして横に引き伸ばし、オフセットを加える
    let normalizedX = (lon - MIN_LNG) / (MAX_LNG - MIN_LNG);
    let x = 0.5 + (normalizedX - 0.5) * X_SCALE + X_OFFSET;
    
    // 緯度を正規化したあと、中心（0.5）を基準にして縦に引き伸ばし、オフセットを加える
    let normalizedY = 1.0 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT);
    let y = 0.5 + (normalizedY - 0.5) * Y_SCALE + Y_OFFSET;
    
    return { x, y };
}

let stations = [];

try {
    const csvPath = path.join(__dirname, 'stations.csv');
    if (fs.existsSync(csvPath)) {
        // エンコードエラーを防ぐためバッファとして読み込み、TextDecoderで安全にデコードする
        const buffer = fs.readFileSync(csvPath);
        
        // Shift-JISまたはUTF-8を自動で正しくデコード
        let rawContent = "";
        try {
            const decoderShiftJIS = new TextDecoder('shift-jis');
            rawContent = decoderShiftJIS.decode(buffer);
        } catch (e) {
            const decoderUTF8 = new TextDecoder('utf-8');
            rawContent = decoderUTF8.decode(buffer);
        }

        const lines = rawContent.split(/\r?\n/);
        
        lines.forEach((line, index) => {
            if (!line.trim() || line.startsWith('#')) return;
            
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            if (cols.length < 6) return;

            const code = cols[1]; // 観測点コード (例: ABSH01)
            const name = cols[2]; // 観測点名 (例: 雄武)
            const lat = parseFloat(cols[4]); // 緯度
            const lon = parseFloat(cols[5]); // 経度

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

app.get('/api/stations', (req, res) => {
    res.json(stations);
});

app.listen(PORT, () => {
    console.log(`中継サーバーがポート ${PORT} で稼働中`);
});