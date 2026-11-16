FROM python:3.12-slim
WORKDIR /app/hdx
COPY requirements.lock requirements.in ./
RUN pip install --no-cache-dir -r requirements.lock
# 构建期预下载嵌入模型进缓存目录（顺带加载 ONNX 验证完整性）：运行时零 huggingface.co 依赖。
# 背景：生产 ECS 直连 HF 不通，fastembed 首用运行时下载挂 50~60s 后抛异常 → search 500 / chat 504
# （2026-11-15 事故）。本层放在 COPY . . 之前：代码变更不使模型层缓存失效。
# 命名卷 fastembed-cache 为空时 Docker 会从镜像该路径拷贝初始化，存量空卷同样拿得到模型。
ENV FASTEMBED_CACHE_DIR=/app/hdx/.fastembed
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-zh-v1.5', cache_dir='/app/hdx/.fastembed')"
# 镜像内禁 HF 联网（fastembed download_model 读取该变量）：缓存命中秒级加载；万一缓存缺失
# 也秒级报错（retries=1），不再挂 60s——可用性判定见 features/ai/client.py embed_available
ENV HF_HUB_OFFLINE=1
# 嵌入推理限单线程，压内存峰值（2026-11-16 事故：1.8G 小内存宿主机上批量嵌入触发
# 全局 OOM，内核挑 RSS 最大的 mysqld 杀掉——见部署与运维说明文档「内存红线」节）
ENV OMP_NUM_THREADS=1
COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
