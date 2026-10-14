# 基础环境
FROM python:3.12-slim 
# 设置工作目录
WORKDIR /app/hdx
# 复制依赖文件
COPY requirements.txt .
# 安装依赖
RUN pip install --no-cache-dir -r requirements.txt
# 复制应用代码
COPY . .
# 设置环境变量
ENV FASTEMBED_CACHE_DIR=/srv/hdt/.fastembed
# 暴露端口
EXPOSE 8001
# 启动应用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]