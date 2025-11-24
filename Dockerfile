# Chọn image Node.js chính thức
FROM node:18

# Cài đặt FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Thư mục làm việc trong container
WORKDIR /usr/src/app

# Copy package.json & package-lock.json
COPY package*.json ./

# Cài đặt dependencies
RUN npm install --production

# Copy toàn bộ code vào container
COPY . .

# Tạo các thư mục tạm cần thiết
RUN mkdir -p /tmp/uploads /tmp/output

# Expose port (Render sẽ override bằng $PORT)
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
