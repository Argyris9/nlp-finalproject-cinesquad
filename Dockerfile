# Backend deployment image (Cloud Run, or any other Docker host).
# Only backend/, models/, and requirements.txt are needed at runtime --
# the frontend, notebooks, and raw datasets under ml-25m/ etc. are
# training-time/dev-time only, see backend/ml/train_recommender.py.
FROM python:3.12-slim

# build-essential/git are a safety net for any dependency without a
# prebuilt wheel for this platform; most of requirements.txt (torch,
# transformers, faiss-cpu, sentence-transformers) ships prebuilt wheels
# so this rarely triggers a real compile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces' Docker SDK runs containers as a non-root user by
# convention, and $HOME needs to be writable -- sentence-transformers /
# transformers cache downloaded models under $HOME/.cache/huggingface at
# runtime (all-MiniLM-L6-v2 always, flan-t5-base only if GEMINI_API_KEY
# isn't set).
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
# Plain `pip install torch` on Linux pulls the full CUDA toolkit
# (nvidia-cublas, nvidia-cudnn, cuda-toolkit, ...) even though this
# container never touches a GPU -- that alone is several GB wasted.
# Installing the CPU-only build first means the requirements.txt install
# below finds torch already satisfied and skips the CUDA variant.
RUN pip install --no-cache-dir --user torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user backend/ ./backend/
COPY --chown=user models/ ./models/

# 7860 is the Hugging Face Spaces convention; PORT is still respected so
# the same image works on Render/Railway/Cloud Run without changes.
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
