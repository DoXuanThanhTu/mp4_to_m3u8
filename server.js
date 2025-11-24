// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fluentFFmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const port = process.env.PORT || 3000;
const DOMAIN = process.env.DOCKER_DOMAIN;
// ------------------- Thư mục tạm -------------------
const uploadDir = path.join('/tmp', 'uploads');
const outputBaseDir = path.join('/tmp', 'output');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputBaseDir)) fs.mkdirSync(outputBaseDir, { recursive: true });

// ------------------- Multer upload -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// ------------------- Job queue đơn giản -------------------
const jobs = {}; // jobId -> { status: 'pending'|'processing'|'done'|'error', output: [] }

// ------------------- Chất lượng chuẩn -------------------
const qualities = [
  { resolution: '640x360', bitrate: '800k', label: '360p', height: 360 },
  { resolution: '1280x720', bitrate: '1500k', label: '720p', height: 720 },
  { resolution: '1920x1080', bitrate: '3000k', label: '1080p', height: 1080 },
];

// ------------------- Health check -------------------
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ------------------- Upload & Convert -------------------
app.post('/convert', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa upload video' });

  const jobId = uuidv4();
  jobs[jobId] = { status: 'pending', output: [] };

  // Trả response ngay
  res.json({ message: 'Video đang được xử lý', jobId });

  // Bắt đầu xử lý async
  processVideo(req.file.path, jobId);
});

// ------------------- Xử lý video async -------------------
async function processVideo(inputFile, jobId) {
  jobs[jobId].status = 'processing';
  const outputDir = path.join(outputBaseDir, jobId);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    const originalHeight = await getVideoHeight(inputFile);
    const qualitiesToConvert = qualities.filter(q => q.height <= originalHeight);

    const promises = qualitiesToConvert.map(q => {
      return new Promise((resolve, reject) => {
        const outputPath = path.join(outputDir, `stream-${q.label}.m3u8`);
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
          .on('end', () => {
            jobs[jobId].output.push(`/hls/${jobId}/` + path.basename(outputPath));
            console.log(`✅ Quality ${q.label} hoàn tất`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`❌ Lỗi convert ${q.label}:`, err);
            reject(err);
          })
          .run();
      });
    });

    await Promise.all(promises);

    jobs[jobId].status = 'done';
    console.log(`🎉 Job ${jobId} hoàn tất!`);
    jobs[jobId].output.forEach(p => console.log(`HLS link: ${DOMAIN}${p}`));

    // Tạo zip download
    createZip(jobId);
  } catch (err) {
    jobs[jobId].status = 'error';
    console.error('❌ Lỗi xử lý video:', err);
  }
}

// ------------------- Lấy độ cao gốc của video -------------------
function getVideoHeight(filePath) {
  return new Promise((resolve, reject) => {
    fluentFFmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) return reject(new Error('Không tìm thấy video stream'));
      resolve(videoStream.height);
    });
  });
}

// ------------------- Tạo zip download -------------------
function createZip(jobId) {
  const jobDir = path.join(outputBaseDir, jobId);
  const zipPath = path.join(outputBaseDir, `${jobId}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`📦 Job ${jobId} đã zip xong (${archive.pointer()} bytes)`);
    console.log(`Download link: ${DOMAIN}/download/${jobId}.zip`);
  });

  archive.on('error', err => { throw err; });

  archive.pipe(output);
  archive.directory(jobDir, false);
  archive.finalize();
}

// ------------------- Poll trạng thái job -------------------
app.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];
  if (!job) return res.status(404).json({ error: 'Job không tồn tại' });
  res.json({ status: job.status, output: job.output });
});

// ------------------- Serve HLS -------------------
app.use('/hls', express.static(outputBaseDir));

// ------------------- Download zip -------------------
app.get('/download/:jobId.zip', (req, res) => {
  const zipPath = path.join(outputBaseDir, `${req.params.jobId}.zip`);
  if (!fs.existsSync(zipPath)) return res.status(404).send('File zip không tồn tại');
  res.download(zipPath);
});

// ------------------- Start server -------------------
app.listen(port, '0.0.0.0', () => {
  console.log(`Server đang chạy trên cổng ${port}`);
});
