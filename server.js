const express = require('express');
const fluentFFmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

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
  const inputFile = path.join(__dirname, 'input.mp4'); // Đường dẫn tới file MP4 bạn muốn chuyển đổi
  const { additionalQualities = [] } = req.body; // Lấy các chất lượng bổ sung từ request body

  // Kết hợp chất lượng mặc định và tuỳ chọn từ request body
  const qualitiesToConvert = [...defaultQualities];

  // Thêm các chất lượng tuỳ chọn vào danh sách chuyển đổi
  if (additionalQualities.length > 0) {
    additionalQualities.forEach((quality) => {
      qualitiesToConvert.push(quality);
    });
  }

  console.log(`Đang chuyển đổi video với các chất lượng: ${qualitiesToConvert.map(q => q.label).join(', ')}`);

  // Tạo một mảng để lưu trữ các video HLS
  const outputPaths = [];

  qualitiesToConvert.forEach((quality) => {
    const outputPath = path.join(outputDir, `stream-${quality.resolution}-${quality.bitrate}.m3u8`);
    
    fluentFFmpeg(inputFile)
      .outputOptions([
        `-vf scale=${quality.resolution}`, // Áp dụng độ phân giải
        `-b:v ${quality.bitrate}`, // Áp dụng bitrate
        '-profile:v baseline',
        '-level 3.0',
        '-start_number 0',
        '-hls_time 10',  // Thời gian mỗi segment
        '-hls_list_size 0',  // Không giới hạn số segment
        '-f hls', // Định dạng đầu ra HLS
      ])
      .output(outputPath)  // Đường dẫn tới file m3u8 đầu ra
      .on('end', () => {
        outputPaths.push(outputPath);
        if (outputPaths.length === qualitiesToConvert.length) {
          // Sau khi tất cả chất lượng được xử lý xong, trả về các đường dẫn m3u8
          res.json({ message: 'Video đã được chuyển đổi thành công', outputPaths });
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

// Khởi động server
app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
