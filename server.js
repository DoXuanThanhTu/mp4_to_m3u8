const express = require('express');
const fluentFFmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();

// Render truyền PORT qua biến môi trường
const port = process.env.PORT || 3000;

// Cấu hình thư mục lưu video HLS
const outputDir = path.join(__dirname, 'hls');

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Chất lượng mặc định và tuỳ chọn
const defaultQualities = [
  { resolution: '640x360', bitrate: '800k', label: '360p' },
  { resolution: '1280x720', bitrate: '1500k', label: '720p' },
  { resolution: '1920x1080', bitrate: '3000k', label: 'Original' },
];

// Endpoint để chuyển đổi video MP4 sang HLS với tuỳ chọn chất lượng
app.post('/convert', express.json(), (req, res) => {
  const inputFile = path.join(__dirname, 'input.mp4');
  const { additionalQualities = [] } = req.body;

  const qualitiesToConvert = [...defaultQualities, ...additionalQualities];

  console.log(
    `Đang chuyển đổi video với các chất lượng: ${qualitiesToConvert
      .map((q) => q.label)
      .join(', ')}`
  );

  const outputPaths = [];

  qualitiesToConvert.forEach((quality) => {
    const outputPath = path.join(
      outputDir,
      `stream-${quality.resolution}-${quality.bitrate}.m3u8`
    );

    fluentFFmpeg(inputFile)
      .outputOptions([
        `-vf scale=${quality.resolution}`,
        `-b:v ${quality.bitrate}`,
        '-profile:v baseline',
        '-level 3.0',
        '-start_number 0',
        '-hls_time 10',
        '-hls_list_size 0',
        '-f hls',
      ])
      .output(outputPath)
      .on('end', () => {
        outputPaths.push(`/hls/${path.basename(outputPath)}`);

        if (outputPaths.length === qualitiesToConvert.length) {
          res.json({
            message: 'Video đã được chuyển đổi thành công',
            outputPaths,
          });
        }
      })
      .on('error', (err) => {
        console.error('Lỗi khi chuyển đổi video:', err);
        res.status(500).json({ error: 'Đã có lỗi xảy ra khi chuyển đổi video.' });
      })
      .run();
  });
});

// Endpoint phục vụ video HLS
app.use('/hls', express.static(outputDir));


// ✅ Quan trọng nhất: Render bắt buộc phải listen 0.0.0.0
app.listen(port, '0.0.0.0', () => {
  console.log(`Server đang chạy trên cổng ${port}`);
});
