const express = require('express');
const fluentFFmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const dayjs = require('dayjs');

const app = express();
const port = process.env.PORT || 3000;

// ------------------- Cấu hình thư mục -------------------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const outputBaseDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputBaseDir)) fs.mkdirSync(outputBaseDir);

// Chất lượng mặc định
const defaultQualities = [
  { resolution: '640x360', bitrate: '800k', label: '360p' },
  { resolution: '1280x720', bitrate: '1500k', label: '720p' },
  { resolution: '1920x1080', bitrate: '3000k', label: 'Original' },
];

// ------------------- Multer upload -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ------------------- Health check -------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ------------------- Biến trạng thái xử lý -------------------
let isProcessing = false;

// ------------------- Route convert -------------------
app.post('/convert', upload.single('video'), express.json(), async (req, res) => {
  if (isProcessing) {
    return res.status(429).json({
      error: 'Server đang bận, vui lòng thử lại sau',
    });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Chưa upload file video' });
  }

  isProcessing = true; // đánh dấu đang xử lý

  try {
    const inputFile = req.file.path;
    const { additionalQualities = [] } = req.body;
    const qualitiesToConvert = [...defaultQualities, ...additionalQualities];

    const fileBaseName = path.parse(req.file.originalname).name;
    const dateStr = dayjs().format('YYYYMMDD_HHmmss');
    const outputDir = path.join(outputBaseDir, `${fileBaseName}_${dateStr}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log(`Đang chuyển đổi video: ${req.file.originalname}`);
    console.log(`Chất lượng convert: ${qualitiesToConvert.map(q => q.label).join(', ')}`);

    const outputPaths = [];

    await Promise.all(
      qualitiesToConvert.map(q => {
        const outputPath = path.join(outputDir, `stream-${q.resolution}-${q.bitrate}.m3u8`);
        return new Promise((resolve, reject) => {
          fluentFFmpeg(inputFile)
            .outputOptions([
              `-vf scale=${q.resolution}`,
              `-b:v ${q.bitrate}`,
              '-profile:v baseline',
              '-level 3.0',
              '-start_number 0',
              '-hls_time 10',
              '-hls_list_size 0',
              '-f hls',
            ])
            .output(outputPath)
            .on('progress', progress => {
              if (progress.percent) {
                console.log(`Quality ${q.label}: ${progress.percent.toFixed(2)}%`);
              }
            })
            .on('end', () => {
              console.log(`Quality ${q.label} đã hoàn tất`);
              outputPaths.push(`/hls/${fileBaseName}_${dateStr}/${path.basename(outputPath)}`);
              resolve();
            })
            .on('error', err => {
              console.error(`Lỗi convert ${q.label}:`, err);
              reject(err);
            })
            .run();
        });
      })
    );

    res.json({ message: 'Video đã được chuyển đổi thành công', outputPaths });
  } catch (err) {
    console.error('Lỗi convert video:', err);
    res.status(500).json({ error: 'Đã có lỗi khi convert video.' });
  } finally {
    isProcessing = false; // reset trạng thái
  }
});

// ------------------- Serve HLS -------------------
app.use('/hls', express.static(outputBaseDir));

// ------------------- Start server -------------------
app.listen(port, '0.0.0.0', () => {
  console.log(`Server đang chạy trên cổng ${port}`);
});
