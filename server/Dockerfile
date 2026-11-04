FROM python:3.12-slim
WORKDIR /app/hdx
COPY requirements.lock requirements.in ./
RUN pip install --no-cache-dir -r requirements.lock
COPY . .
# 与 docker-compose 的 fastembed-cache 卷同路径：模型缓存持久化，重建容器不重新下载
ENV FASTEMBED_CACHE_DIR=/app/hdx/.fastembed
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
