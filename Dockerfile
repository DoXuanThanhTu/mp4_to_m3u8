# Bắt đầu từ image Node.js chính thức
FROM node:18

# Cài đặt FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Thiết lập thư mục làm việc trong container
WORKDIR /usr/src/app

# Copy package.json và package-lock.json vào container
COPY package*.json ./

# Cài đặt các phụ thuộc Node.js
RUN npm install

# Copy tất cả các file còn lại vào container
COPY . .

# Tạo các thư mục upload và output nếu chưa tồn tại
RUN mkdir -p uploads output

# Mở port mà server sẽ lắng nghe
# Lưu ý: Render sẽ gán port động qua biến môi trường PORT
EXPOSE 3000

# Lệnh khởi động ứng dụng Node.js
CMD ["node", "server.js"]
